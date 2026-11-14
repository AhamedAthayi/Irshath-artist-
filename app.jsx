import React, { useState, useEffect, useRef, useMemo, createContext, useContext } from "react";
import { createRoot } from "react-dom/client";

/* ================= DEFAULT SETTINGS (admin page can change these) ================= */
const DEFAULT_SETTINGS = {
  artist: "A.M. Irshath",
  tagline: "Dream · Create · Inspire",
  phone: "0758545805",
  waNumber: "94758545805", // 0758545805 with Sri Lanka code 94
  email: "am.irsath75@gmail.com",
  popupEnabled: true,
  socials: {
    facebook: "https://facebook.com/",
    instagram: "https://instagram.com/",
    tiktok: "https://tiktok.com/",
    youtube: "https://youtube.com/",
  },
};
const CURRENCY = "LKR";
const DEFAULT_PRICE = 25000;
const STATE_KEY = "irshath_site_v2";
const ADMIN_HASH = "__ADMIN_HASH__"; // SHA-256 of the default admin password (set at build time)

/* ================= images from the art PDF + logo ================= */
const PHOTOS = window.ART_IMAGES || [];
const HERO_PHOTOS = window.HERO_IMAGES || [];
const LOGO = window.LOGO_SRC || "";

const DEFAULT_STATE = {
  auth: { user: "admin", hash: ADMIN_HASH },
  settings: DEFAULT_SETTINGS,
  edits: {},      // edits to built-in artworks, keyed "s1", "s2"...
  deleted: [],    // ids of hidden built-in artworks
  added: [],      // artworks added in admin
  promos: [
    {
      id: "p1",
      title: "Custom mural offer",
      text: "Book a custom wall painting this month. Message me on WhatsApp for a free quote.",
      image: "",
      link: "shop",
      start: "2026-01-01",
      end: "2030-12-31",
      active: true,
    },
  ],
  pages: [],
};

/* ================= helpers ================= */
const pad = (n) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
const isLive = (p) => {
  const t = today();
  return p.active && (!p.start || p.start <= t) && (!p.end || p.end >= t);
};
const promoStatus = (p) => {
  const t = today();
  if (!p.active) return "off";
  if (p.start && p.start > t) return "scheduled";
  if (p.end && p.end < t) return "expired";
  return "live";
};

function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return { ...JSON.parse(JSON.stringify(DEFAULT_STATE)), ...JSON.parse(raw) };
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function saveState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false; // storage full
  }
}

function buildProducts(state) {
  const seed = PHOTOS.map((src, i) => ({
    id: "s" + (i + 1),
    src,
    heroSrc: HERO_PHOTOS[i] || src,
    name: "Artwork " + pad(i + 1),
    medium: "Hand-painted",
    size: "Custom size",
    price: DEFAULT_PRICE,
    description: "",
  }));
  return seed
    .map((p) => {
      const e = state.edits[p.id];
      return e ? { ...p, ...e, heroSrc: e.src || p.heroSrc } : p;
    })
    .concat(state.added)
    .filter((p) => !state.deleted.includes(p.id));
}

async function sha256(text) {
  if (!window.crypto || !window.crypto.subtle) throw new Error("Login needs a secure page (open the file in Chrome or host it online).");
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fileToDataUrl(file, max = 900) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * s);
        c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = r.result;
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const Ctx = createContext(null);
const useSite = () => useContext(Ctx);
const money = (n) => CURRENCY + " " + Number(n).toLocaleString("en-US");
const waLink = (num, text) => "https://wa.me/" + num + (text ? "?text=" + encodeURIComponent(text) : "");

function splitLetters(text) {
  return text.split("").map((c, i) => (
    <span key={i} className="ch" style={{ animationDelay: 0.3 + i * 0.04 + "s" }}>
      {c === " " ? " " : c}
    </span>
  ));
}

function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
}

/* 3D tilt (mouse only) */
function Tilt({ children, className = "" }) {
  const ref = useRef(null);
  const move = (e) => {
    if (!ref.current || window.matchMedia("(hover: none)").matches) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform =
      "perspective(900px) rotateX(" + -y * 8 + "deg) rotateY(" + x * 8 + "deg) translateY(-4px)";
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <div ref={ref} className={"tilt " + className} onMouseMove={move} onMouseLeave={leave}>
      {children}
    </div>
  );
}

/* Magnetic button: follows the cursor slightly */
function Magnetic({ children, className = "", onClick, icon }) {
  const ref = useRef(null);
  const move = (e) => {
    if (!ref.current || window.matchMedia("(hover: none)").matches) return;
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    ref.current.style.transform = "translate(" + dx * 0.18 + "px," + dy * 0.25 + "px)";
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "";
  };
  return (
    <span ref={ref} className="magnetic" onMouseMove={move} onMouseLeave={leave}>
      <button className={className} onClick={onClick}>{icon && <i className={icon + " me-2"}></i>}{children}</button>
    </span>
  );
}

/* ================= intro splash ================= */
function Splash({ artist }) {
  const [show, setShow] = useState(() => !sessionStorage.getItem("irshath_splash"));
  useEffect(() => {
    if (!show) return;
    sessionStorage.setItem("irshath_splash", "1");
    const t = setTimeout(() => setShow(false), 1500);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div className="splash">
      {LOGO && <img src={LOGO} alt="" className="splash-logo" />}
      <div className="splash-name">{artist}</div>
      <div className="splash-bar"><span></span></div>
    </div>
  );
}

/* ================= header ================= */
function Header({ count, onCart, query, setQuery, menuOpen, setMenuOpen, onPage }) {
  const { settings, pages } = useSite();
  const links = [
    ["#home", "Home"],
    ["#shop", "Shop"],
    ["#services", "Services"],
    ["#about", "About"],
    ["#contact", "Contact"],
  ];
  return (
    <header className="site-header">
      <div className="container nav-row">
        <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label="Open menu">
          <i className={"fa-solid " + (menuOpen ? "fa-xmark" : "fa-bars")}></i>
        </button>
        <a href="#home" className="brand" onClick={() => setMenuOpen(false)}>
          {LOGO && <img src={LOGO} alt="" className="brand-logo" />}
          <span>{settings.artist}</span>
        </a>
        <nav className={"main-nav " + (menuOpen ? "open" : "")}>
          {links.map(([href, label]) => (
            <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
          ))}
          {pages.filter((p) => p.active).map((p) => (
            <button key={p.id} className="nav-page" onClick={() => { setMenuOpen(false); onPage(p.id); }}>
              {p.title}
            </button>
          ))}
        </nav>
        <div className="search">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search artwork" aria-label="Search artwork" />
        </div>
        <div className="head-icons">
          <a className="icon-btn" href={waLink(settings.waNumber, "")} target="_blank" rel="noreferrer" aria-label="WhatsApp">
            <i className="fa-brands fa-whatsapp"></i>
          </a>
          <a className="icon-btn" href="#admin" aria-label="Settings and admin" title="Admin settings">
            <i className="fa-solid fa-gear"></i>
          </a>
          <button className="icon-btn" onClick={onCart} aria-label="Cart">
            <i className="fa-solid fa-bag-shopping"></i>
            {count > 0 && <span className="count" key={count}>{count}</span>}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ================= hero ================= */
function Hero({ slides, onAdd, onView, onBuy }) {
  const { settings } = useSite();
  const [i, setI] = useState(0);
  const layer = useRef(null);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length]);
  useEffect(() => {
    const onScroll = () => {
      if (layer.current) layer.current.style.transform = "translateY(" + window.scrollY * 0.3 + "px)";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => { if (i >= slides.length) setI(0); }, [slides.length]);
  const s = slides[i % Math.max(slides.length, 1)];
  return (
    <section id="home" className="hero">
      <div className="hero-layer" ref={layer}>
        {slides.map((a, k) => (
          <div key={a.id} className={"hero-slide " + (k === i ? "active" : "")} style={{ backgroundImage: "url(" + a.heroSrc + ")" }} />
        ))}
      </div>
      <div className="hero-shade"></div>
      <div className="container hero-content">
        <div className="hero-text" key={i}>
          <span className="eyebrow">Hand-painted art &amp; murals</span>
          <h1>
            Hi, I'm <span className="accent grad">{splitLetters(settings.artist)}</span>
          </h1>
          <p className="hero-sub">{settings.tagline}. Custom murals, landscapes and wall art made for your space.</p>
          <div className="d-flex gap-3 flex-wrap">
            {s && <Magnetic className="btn-pink" onClick={() => onAdd(s)}>Add to cart 🛒</Magnetic>}
            {s && <Magnetic className="btn-wa" icon="fa-brands fa-whatsapp" onClick={() => onBuy(s)}>Buy on WhatsApp</Magnetic>}
            {s && <Magnetic className="btn-light-line" onClick={() => onView(s)}>View product</Magnetic>}
          </div>
        </div>
        {s && <div className="hero-counter">{s.name} <span>/ {pad(slides.length)}</span></div>}
      </div>
      {slides.length > 1 && (
        <div className="hero-dots">
          {slides.map((_, k) => (
            <button key={k} className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={"Slide " + (k + 1)}></button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ================= promotions slider (live promos only) ================= */
function PromoCard({ p, onAction }) {
  return (
    <div className="promo-card">
      <div className="promo-img" style={{ backgroundImage: p.image ? "url(" + p.image + ")" : "linear-gradient(135deg,#e0418e,#17161a)" }}></div>
      <div className="promo-body">
        <span className="eyebrow">Special offer</span>
        <h3>{p.title}</h3>
        <p>{p.text}</p>
        <Magnetic className="btn-pink" onClick={() => onAction(p)}>
          {p.link === "shop" || !p.link ? "Shop now" : "Enquire now"}
        </Magnetic>
      </div>
    </div>
  );
}

function PromoSlider({ promos, onAction }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (promos.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % promos.length), 6000);
    return () => clearInterval(t);
  }, [promos.length]);
  if (!promos.length) return null;
  const k = i % promos.length;
  return (
    <section className="section promo-section">
      <div className="container">
        <div className="promo-stage" key={promos[k].id}>
          <PromoCard p={promos[k]} onAction={onAction} />
        </div>
        {promos.length > 1 && (
          <div className="promo-dots">
            {promos.map((p, j) => (
              <button key={p.id} className={j === k ? "on" : ""} onClick={() => setI(j)} aria-label={"Offer " + (j + 1)}></button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ================= promotion pop-up (shows on opening) ================= */
function PromoPopup({ promos, onClose, onAction }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (promos.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % promos.length), 5000);
    return () => clearInterval(t);
  }, [promos.length]);
  const p = promos[i];
  return (
    <>
      <div className="backdrop" onClick={onClose}></div>
      <div className="popup-box" role="dialog" aria-label="Special offer">
        <span className="confetti c1"></span><span className="confetti c2"></span><span className="confetti c3"></span>
        <span className="confetti c4"></span><span className="confetti c5"></span><span className="confetti c6"></span>
        <button className="close-x" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"></i></button>
        <div className="popup-img" style={{ backgroundImage: p.image ? "url(" + p.image + ")" : "linear-gradient(135deg,#e0418e,#17161a)" }}>
          <span className="popup-badge"><i className="fa-solid fa-gift me-1"></i>Special offer</span>
        </div>
        <div className="popup-body">
          <h3 key={p.id} className="popup-title">{p.title}</h3>
          <p className="muted">{p.text}</p>
          <div className="d-flex gap-2 flex-wrap">
            <Magnetic className="btn-pink" onClick={() => onAction(p)}>{p.link === "shop" || !p.link ? "Shop now" : "Enquire now"}</Magnetic>
            <button className="btn-line" onClick={onClose}>Maybe later</button>
          </div>
          {promos.length > 1 && (
            <div className="promo-dots left">
              {promos.map((q, j) => <button key={q.id} className={j === i ? "on" : ""} onClick={() => setI(j)} aria-label={"Offer " + (j + 1)}></button>)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ================= ticker ================= */
const TICKER = ["Hand-painted murals", "Landscape paintings", "Custom sizes", "Kids & education murals", "Order on WhatsApp", "Made for your space"];
function Ticker() {
  return (
    <div className="ticker" aria-hidden="true">
      <div className="ticker-track">
        {[...TICKER, ...TICKER].map((t, k) => (
          <span key={k}>{t}<i className="fa-solid fa-star"></i></span>
        ))}
      </div>
    </div>
  );
}

/* ================= top picks ================= */
function TopPicks({ items, onAdd, onView, onBuy }) {
  const feat = items[0];
  const rest = items.slice(1);
  if (!feat) return null;
  return (
    <section className="section">
      <div className="container">
        <div className="sec-head reveal">
          <span className="eyebrow">Featured</span>
          <h2>Top picks</h2>
        </div>
        <div className="row g-4">
          <div className="col-lg-7 reveal">
            <Tilt className="feature-card">
              <div className="feature-img" style={{ backgroundImage: "url(" + feat.src + ")" }}>
                <span className="badge-top">No. 1 top pick</span>
              </div>
              <div className="feature-body">
                <h3>{feat.name}</h3>
                <p className="muted">{feat.medium} · {feat.size}</p>
                <div className="price">{money(feat.price)}</div>
                <div className="d-flex gap-2 flex-wrap">
                  <Magnetic className="btn-pink" onClick={() => onAdd(feat)}>Add to cart 🛒</Magnetic>
                  <Magnetic className="btn-wa" icon="fa-brands fa-whatsapp" onClick={() => onBuy(feat)}>Buy on WhatsApp</Magnetic>
                  <button className="btn-line" onClick={() => onView(feat)}>View product</button>
                </div>
              </div>
            </Tilt>
          </div>
          <div className="col-lg-5">
            <div className="row g-3">
              {rest.map((a, i) => (
                <div className="col-6 reveal" key={a.id} style={{ transitionDelay: i * 0.06 + "s" }}>
                  <Tilt className="mini-card">
                    <div className="mini-img" style={{ backgroundImage: "url(" + a.src + ")" }} onClick={() => onView(a)}></div>
                    <div className="mini-body">
                      <div className="mini-name">{a.name}</div>
                      <div className="price small">{money(a.price)}</div>
                      <button className="btn-pink btn-sm-pink" onClick={() => onAdd(a)}>Add to cart</button>
                      <button className="btn-wa btn-sm-pink" onClick={() => onBuy(a)}><i className="fa-brands fa-whatsapp me-1"></i>Buy</button>
                    </div>
                  </Tilt>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= services ================= */
function Services({ products, onOrder }) {
  const { settings } = useSite();
  const services = [
    { title: "Wall murals", text: "Full walls painted for homes, shops and offices.", img: products[1], ask: "a wall mural" },
    { title: "Education murals", text: "Bright, learning-themed murals for schools and institutes.", img: products[2], ask: "an education mural" },
    { title: "Landscape paintings", text: "Calm scenes of rivers, hills, villages and forests.", img: products[0], ask: "a landscape painting" },
  ].filter((s) => s.img);
  return (
    <section id="services" className="section soft">
      <div className="container">
        <div className="sec-head reveal">
          <span className="eyebrow">What I do</span>
          <h2>Our services</h2>
        </div>
        <div className="row g-4">
          {services.map((s, i) => (
            <div className="col-md-4 reveal" key={s.title} style={{ transitionDelay: i * 0.08 + "s" }}>
              <Tilt className="service-card">
                <div className="service-img" style={{ backgroundImage: "url(" + s.img.src + ")" }}></div>
                <div className="service-body">
                  <h4>{s.title}</h4>
                  <p className="muted">{s.text}</p>
                  <button className="btn-line" onClick={() => onOrder(s.ask)}>
                    <i className="fa-brands fa-whatsapp me-2"></i>Enquire
                  </button>
                </div>
              </Tilt>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= how to order ================= */
function HowToOrder() {
  const steps = [
    { icon: "fa-solid fa-paintbrush", title: "Pick an artwork", text: "Browse the shop and tap View to see it large." },
    { icon: "fa-solid fa-ruler-combined", title: "Choose your size", text: "Add it to your cart and note the size or wall you need." },
    { icon: "fa-brands fa-whatsapp", title: "Send on WhatsApp", text: "Place the order and WhatsApp opens with your details filled in." },
  ];
  return (
    <section className="section">
      <div className="container">
        <div className="sec-head center reveal">
          <span className="eyebrow">Easy ordering</span>
          <h2>How to order</h2>
        </div>
        <div className="row g-4">
          {steps.map((s, i) => (
            <div className="col-md-4 reveal" key={s.title} style={{ transitionDelay: i * 0.1 + "s" }}>
              <div className="step-card">
                <div className="step-num">{i + 1}</div>
                <i className={s.icon + " step-icon"}></i>
                <h5>{s.title}</h5>
                <p className="muted mb-0">{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= shop ================= */
function Shop({ items, onAdd, onView, justAdded, onBuy }) {
  const [n, setN] = useState(12);
  useEffect(() => setN(12), [items.length]);
  const shown = items.slice(0, n);
  return (
    <section id="shop" className="section soft">
      <div className="container">
        <div className="sec-head reveal">
          <span className="eyebrow">E-commerce</span>
          <h2>Shop the collection</h2>
        </div>
        {items.length === 0 && <p className="muted">No artwork matches your search.</p>}
        <div className="row g-4">
          {shown.map((a, i) => (
            <div className="col-6 col-lg-3 reveal" key={a.id} style={{ transitionDelay: (i % 4) * 0.05 + "s" }}>
              <Tilt className="product-card">
                <div className="product-img" onClick={() => onView(a)} style={{ backgroundImage: "url(" + a.src + ")" }}>
                  <span className="product-view"><i className="fa-solid fa-eye me-1"></i>View</span>
                </div>
                <div className="product-body">
                  <div className="product-name">{a.name}</div>
                  <div className="muted small">{a.medium} · {a.size}</div>
                  <div className="price">{money(a.price)}</div>
                  <button className={"btn-pink w-100 " + (justAdded === a.id ? "added" : "")} onClick={() => onAdd(a)}>
                    {justAdded === a.id ? "Added ✓" : "Add to cart 🛒"}
                  </button>
                  <button className="btn-wa w-100 mt-2" onClick={() => onBuy(a)}>
                    <i className="fa-brands fa-whatsapp me-2"></i>Buy on WhatsApp
                  </button>
                </div>
              </Tilt>
            </div>
          ))}
        </div>
        {n < items.length && (
          <div className="text-center mt-5">
            <button className="btn-line" onClick={() => setN(n + 12)}>Show more ({items.length - n} left)</button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ================= commission band ================= */
function Commission({ onOrder }) {
  return (
    <section className="band">
      <div className="container band-inner reveal">
        <div>
          <span className="eyebrow light">Custom work</span>
          <h2>Want a custom wall or canvas?</h2>
          <p>Tell me the room, size and style you like and I will paint it for you.</p>
        </div>
        <Magnetic className="btn-pink big" onClick={() => onOrder("a custom artwork")}>
          <i className="fa-brands fa-whatsapp me-2"></i>Chat on WhatsApp
        </Magnetic>
      </div>
    </section>
  );
}

/* ================= about ================= */
function About() {
  const { settings } = useSite();
  return (
    <section id="about" className="section">
      <div className="container">
        <div className="row align-items-center g-5">
          <div className="col-lg-5 reveal">
            <div className="about-logo">
              {LOGO ? <img src={LOGO} alt={settings.artist} /> : <span>{settings.artist}</span>}
            </div>
          </div>
          <div className="col-lg-7 reveal">
            <span className="eyebrow">About the artist</span>
            <h2>Art that <span className="accent">speaks</span></h2>
            <p className="muted">
              I am {settings.artist}. I believe every wall and every canvas can tell a story. From calm landscapes and
              village scenes to bold school murals, I bring each idea to life with colour and care.
            </p>
            <div className="chips">
              {["Acrylic painting", "Wall murals", "Landscapes", "Pencil sketches", "Kids murals", "Digital art"].map((s) => (
                <span className="chip" key={s}>{s}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= contact ================= */
function Contact() {
  const { settings } = useSite();
  const s = settings.socials;
  return (
    <section id="contact" className="section soft">
      <div className="container">
        <div className="sec-head center reveal">
          <span className="eyebrow">Let's connect</span>
          <h2>Get in touch</h2>
        </div>
        <div className="row g-4 justify-content-center">
          <div className="col-md-4 reveal">
            <div className="contact-card">
              <i className="fa-solid fa-phone"></i>
              <h5>Phone / WhatsApp</h5>
              <a href={waLink(settings.waNumber, "")} target="_blank" rel="noreferrer">{settings.phone}</a>
            </div>
          </div>
          <div className="col-md-4 reveal">
            <div className="contact-card">
              <i className="fa-solid fa-envelope"></i>
              <h5>Email</h5>
              <a href={"mailto:" + settings.email}>{settings.email}</a>
            </div>
          </div>
          <div className="col-md-4 reveal">
            <div className="contact-card">
              <i className="fa-solid fa-share-nodes"></i>
              <h5>Follow me</h5>
              <div className="socials">
                <a className="social s-fb" href={s.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><i className="fa-brands fa-facebook-f"></i></a>
                <a className="social s-wa" href={waLink(settings.waNumber, "")} target="_blank" rel="noreferrer" aria-label="WhatsApp"><i className="fa-brands fa-whatsapp"></i></a>
                <a className="social s-tt" href={s.tiktok} target="_blank" rel="noreferrer" aria-label="TikTok"><i className="fa-brands fa-tiktok"></i></a>
                <a className="social s-ig" href={s.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><i className="fa-brands fa-instagram"></i></a>
                <a className="social s-yt" href={s.youtube} target="_blank" rel="noreferrer" aria-label="YouTube"><i className="fa-brands fa-youtube"></i></a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { settings, pages } = useSite();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="row g-4">
          <div className="col-md-4">
            <div className="foot-brand">{settings.artist}</div>
            <p className="muted small">{settings.tagline}</p>
          </div>
          <div className="col-6 col-md-2">
            <h6>Shop</h6>
            <a href="#shop">All artwork</a>
            <a href="#services">Services</a>
          </div>
          <div className="col-6 col-md-2">
            <h6>Help</h6>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
            {pages.filter((p) => p.active).map((p) => (
              <a key={p.id} href={"#page-" + p.id}>{p.title}</a>
            ))}
          </div>
          <div className="col-md-4">
            <h6>Contact</h6>
            <a href={waLink(settings.waNumber, "")} target="_blank" rel="noreferrer">WhatsApp {settings.phone}</a>
            <a href={"mailto:" + settings.email}>{settings.email}</a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© 2026 {settings.artist}. All rights reserved.</span>
          <span>Created by <b>Nexra Tech Solutions</b></span>
        </div>
      </div>
    </footer>
  );
}

/* ================= custom page modal ================= */
function PageModal({ page, onClose }) {
  return (
    <>
      <div className="backdrop" onClick={onClose}></div>
      <div className="modal-box small" role="dialog" aria-label={page.title}>
        <button className="close-x" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"></i></button>
        <div className="p-4 p-md-5">
          <h3>{page.title}</h3>
          {page.body.split(/\n\s*\n/).map((para, i) => <p key={i} className="muted">{para}</p>)}
        </div>
      </div>
    </>
  );
}

/* ================= cart drawer ================= */
function CartDrawer({ items, total, onClose, onQty, onRemove, onCheckout }) {
  return (
    <>
      <div className="backdrop" onClick={onClose}></div>
      <aside className="drawer" role="dialog" aria-label="Cart">
        <div className="drawer-head">
          <h4>Your cart 🛒</h4>
          <button className="icon-plain" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"></i></button>
        </div>
        <div className="drawer-body">
          {items.length === 0 && <p className="muted text-center mt-5">Your cart is empty.<br />Add some beautiful art!</p>}
          {items.map((i) => (
            <div className="cart-item" key={i.art.id}>
              <div className="cart-thumb" style={{ backgroundImage: "url(" + i.art.src + ")" }}></div>
              <div className="flex-grow-1">
                <div className="fw-semibold">{i.art.name}</div>
                <div className="price small">{money(i.art.price)}</div>
                <div className="qty">
                  <button onClick={() => onQty(i.art.id, -1)} aria-label="Less">−</button>
                  <span>{i.qty}</span>
                  <button onClick={() => onQty(i.art.id, 1)} aria-label="More">+</button>
                </div>
              </div>
              <button className="icon-plain danger" onClick={() => onRemove(i.art.id)} aria-label="Remove"><i className="fa-solid fa-trash-can"></i></button>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <div className="drawer-foot">
            <div className="d-flex justify-content-between mb-3"><span>Total</span><span className="price">{money(total)}</span></div>
            <button className="btn-pink w-100" onClick={onCheckout}>Place order</button>
          </div>
        )}
      </aside>
    </>
  );
}

/* ================= product viewer ================= */
function ProductModal({ products, index, onIndex, onClose, onAdd, onBuy }) {
  const [zoom, setZoom] = useState(false);
  const a = products[index];
  const shift = (d) => {
    setZoom(false);
    onIndex((index + d + products.length) % products.length);
  };
  useEffect(() => {
    const k = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") shift(1);
      if (e.key === "ArrowLeft") shift(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  return (
    <>
      <div className="backdrop" onClick={onClose}></div>
      <div className="modal-box" role="dialog" aria-label={a.name}>
        <button className="close-x" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"></i></button>
        <div className="viewer">
          <button className="arrow left" onClick={() => shift(-1)} aria-label="Previous"><i className="fa-solid fa-chevron-left"></i></button>
          <div key={a.id} className={"viewer-img " + (zoom ? "zoomed" : "")} style={{ backgroundImage: "url(" + a.src + ")" }} onClick={() => setZoom(!zoom)} title="Click to zoom"></div>
          <button className="arrow right" onClick={() => shift(1)} aria-label="Next"><i className="fa-solid fa-chevron-right"></i></button>
        </div>
        <div className="viewer-count">{index + 1} / {products.length} · tap image to zoom</div>
        <div className="p-4">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
            <div>
              <h3 className="mb-1">{a.name}</h3>
              <p className="muted mb-2">{a.medium} · {a.size}</p>
            </div>
            <div className="price fs-4">{money(a.price)}</div>
          </div>
          {a.description && <p className="mt-2">{a.description}</p>}
          <div className="d-flex flex-wrap gap-2 mt-3">
            <button className="btn-pink" onClick={() => onAdd(a)}>Add to cart 🛒</button>
            <button className="btn-wa" onClick={() => onBuy(a)}><i className="fa-brands fa-whatsapp me-2"></i>Buy on WhatsApp</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= checkout ================= */
function Checkout({ items, total, onClose, onSent }) {
  const { settings } = useSite();
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", note: "" });
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (!form.name.trim()) er.name = "Please enter your name";
    if (!/^[0-9+ ]{9,15}$/.test(form.phone.trim())) er.phone = "Enter a valid phone number";
    if (!form.address.trim()) er.address = "Please enter your address";
    setErrors(er);
    if (Object.keys(er).length) return;
    const msg = [
      "🎨 New art order - " + settings.artist,
      "",
      "Artworks:",
      ...items.map((i, n) => n + 1 + ". " + i.art.name + " (" + i.art.medium + ", " + i.art.size + ") x" + i.qty + " = " + money(i.art.price * i.qty)),
      "",
      "Total: " + money(total),
      "",
      "Customer details",
      "Name: " + form.name,
      "Phone: " + form.phone,
      "Email: " + (form.email || "-"),
      "Address: " + form.address,
      "Note: " + (form.note || "-"),
      "",
      "Please confirm my order. Thank you!",
    ].join("\n");
    window.open(waLink(settings.waNumber, msg), "_blank");
    onSent();
  };
  return (
    <>
      <div className="backdrop" onClick={onClose}></div>
      <div className="modal-box small" role="dialog" aria-label="Place order">
        <button className="close-x" onClick={onClose} aria-label="Close"><i className="fa-solid fa-xmark"></i></button>
        <div className="p-4 p-md-5">
          <h3 className="mb-1">Place your order</h3>
          <p className="muted small mb-4">Your order is sent to {settings.artist} on WhatsApp.</p>
          <div className="summary">
            {items.length === 0 && <p className="muted mb-0">No items in cart.</p>}
            {items.map((i) => (
              <div className="d-flex justify-content-between small mb-1" key={i.art.id}>
                <span>{i.art.name} × {i.qty}</span><span>{money(i.art.price * i.qty)}</span>
              </div>
            ))}
            <hr />
            <div className="d-flex justify-content-between fw-bold"><span>Total</span><span className="price">{money(total)}</span></div>
          </div>
          <form onSubmit={submit} noValidate>
            <div className="mb-3">
              <input className="field" placeholder="Full name *" value={form.name} onChange={set("name")} />
              {errors.name && <div className="err">{errors.name}</div>}
            </div>
            <div className="mb-3">
              <input className="field" placeholder="Phone number *" value={form.phone} onChange={set("phone")} />
              {errors.phone && <div className="err">{errors.phone}</div>}
            </div>
            <div className="mb-3">
              <input type="email" className="field" placeholder="Email (optional)" value={form.email} onChange={set("email")} />
            </div>
            <div className="mb-3">
              <textarea rows="2" className="field" placeholder="Delivery address *" value={form.address} onChange={set("address")}></textarea>
              {errors.address && <div className="err">{errors.address}</div>}
            </div>
            <div className="mb-4">
              <textarea rows="2" className="field" placeholder="Note (size, wall, colour, etc.)" value={form.note} onChange={set("note")}></textarea>
            </div>
            <button type="submit" className="btn-pink w-100 big" disabled={items.length === 0}>
              <i className="fa-brands fa-whatsapp me-2"></i>Send order on WhatsApp
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

/* ================= admin ================= */
function AdminLogin({ state, onOk }) {
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    try {
      const h = await sha256(pw);
      if (user.trim() === state.auth.user && h === state.auth.hash) {
        sessionStorage.setItem("irshath_admin", "1");
        onOk();
      } else setErr("Wrong username or password.");
    } catch (ex) {
      setErr(ex.message);
    }
  };
  return (
    <div className="admin-login">
      <form className="login-card" onSubmit={submit}>
        {LOGO && <img src={LOGO} alt="" className="login-logo" />}
        <h3>Admin login</h3>
        <p className="muted small">Products, promotions, pages and settings.</p>
        <input className="field mb-3" placeholder="Username" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" />
        <input className="field mb-3" type="password" placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {err && <div className="err mb-2">{err}</div>}
        <button className="btn-pink w-100">Log in</button>
        <a className="back-link" href="#home">← Back to website</a>
      </form>
    </div>
  );
}

function AdminProducts({ state, update, products, flash }) {
  const empty = { name: "", medium: "", size: "", price: "", description: "", src: "" };
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const startEdit = (p) => { setEditId(p.id); setForm({ ...p }); };
  const startNew = () => { setEditId("new"); setForm({ ...empty, medium: "Hand-painted", size: "Custom size", price: DEFAULT_PRICE }); };

  const onImage = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setBusy(true);
    try {
      const img = await fileToDataUrl(f);
      setForm((x) => ({ ...x, src: "", _pending: img }));
    } catch (er) { flash("Could not read that image."); }
    setBusy(false);
  };

  const save = (e) => {
    e.preventDefault();
    const img = form._pending || form.src;
    if (!form.name.trim()) return flash("Enter a product name.");
    if (!img) return flash("Upload a product image.");
    const data = {
      name: form.name.trim(),
      medium: form.medium.trim() || "Hand-painted",
      size: form.size.trim() || "Custom size",
      price: Number(form.price) || 0,
      description: form.description.trim(),
      src: img,
      heroSrc: img,
    };
    const next = { ...state };
    if (editId === "new") {
      next.added = [...state.added, { id: "n" + Date.now(), ...data }];
    } else if (editId.startsWith("s")) {
      next.edits = { ...state.edits, [editId]: data };
    } else {
      next.added = state.added.map((p) => (p.id === editId ? { ...p, ...data } : p));
    }
    if (update(next)) { flash("Product saved ✔"); setEditId(null); }
  };

  const remove = (p) => {
    if (!window.confirm("Remove \"" + p.name + "\" from the shop?")) return;
    const next = { ...state };
    if (p.id.startsWith("s")) next.deleted = [...state.deleted, p.id];
    else next.added = state.added.filter((x) => x.id !== p.id);
    update(next) && flash("Product removed.");
  };

  const restoreHidden = () => update({ ...state, deleted: [] }) && flash("Hidden artworks restored.");
  const preview = form._pending || form.src;

  return (
    <div>
      <div className="admin-bar">
        <h4>Products ({products.length})</h4>
        <div className="d-flex gap-2 flex-wrap">
          {state.deleted.length > 0 && <button className="btn-line small-btn" onClick={restoreHidden}>Restore {state.deleted.length} hidden</button>}
          <button className="btn-pink small-btn" onClick={startNew}><i className="fa-solid fa-plus me-1"></i>Add product</button>
        </div>
      </div>

      {editId && (
        <form className="admin-form" onSubmit={save}>
          <h5>{editId === "new" ? "New product" : "Edit product"}</h5>
          <div className="row g-3">
            <div className="col-md-6"><label>Name *</label><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-md-3"><label>Medium</label><input className="field" value={form.medium} onChange={(e) => setForm({ ...form, medium: e.target.value })} /></div>
            <div className="col-md-3"><label>Size</label><input className="field" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} /></div>
            <div className="col-md-3"><label>Price ({CURRENCY})</label><input className="field" type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div className="col-md-9"><label>Description</label><input className="field" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="col-12">
              <label>Image *</label>
              <div className="upload">
                {preview && <div className="thumb-preview" style={{ backgroundImage: "url(" + preview + ")" }}></div>}
                <input type="file" accept="image/*" onChange={onImage} />
              </div>
              {busy && <p className="muted small">Preparing image…</p>}
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button className="btn-pink" disabled={busy}>Save product</button>
            <button type="button" className="btn-line" onClick={() => setEditId(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="admin-list">
        {products.map((p) => (
          <div className="admin-row" key={p.id}>
            <div className="admin-thumb" style={{ backgroundImage: "url(" + p.src + ")" }}></div>
            <div className="flex-grow-1">
              <div className="fw-semibold">{p.name}</div>
              <div className="muted small">{p.medium} · {p.size} · {money(p.price)}</div>
            </div>
            <button className="btn-line small-btn" onClick={() => startEdit(p)}>Edit</button>
            <button className="icon-plain danger" onClick={() => remove(p)} aria-label="Remove"><i className="fa-solid fa-trash-can"></i></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminPromos({ state, update, flash }) {
  const empty = { id: "", title: "", text: "", image: "", link: "shop", start: today(), end: "", active: true };
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const onImage = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setBusy(true);
    try {
      const img = await fileToDataUrl(f, 1000);
      setForm((x) => ({ ...x, image2: img }));
    } catch (er) { flash("Could not read that image."); }
    setBusy(false);
  };

  const save = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return flash("Enter a promotion title.");
    if (form.start && form.end && form.end < form.start) return flash("End date is before the start date.");
    const image = form.image2 || form.image || "";
    const data = { title: form.title.trim(), text: form.text.trim(), image, link: form.link, start: form.start, end: form.end, active: !!form.active };
    const promos = form.id
      ? state.promos.map((p) => (p.id === form.id ? { ...p, ...data } : p))
      : [...state.promos, { id: "p" + Date.now(), ...data }];
    if (update({ ...state, promos })) { flash("Promotion saved ✔"); setForm(null); }
  };

  const toggle = (p) => update({ ...state, promos: state.promos.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)) }) && flash("Updated.");
  const remove = (p) => {
    if (window.confirm("Delete this promotion?")) update({ ...state, promos: state.promos.filter((x) => x.id !== p.id) }) && flash("Promotion deleted.");
  };
  const badge = { live: "Live now", scheduled: "Scheduled", expired: "Expired", off: "Off" };

  return (
    <div>
      <div className="admin-bar">
        <h4>Promotions</h4>
        <button className="btn-pink small-btn" onClick={() => setForm({ ...empty })}><i className="fa-solid fa-plus me-1"></i>Add promotion</button>
      </div>
      <p className="muted small">A promotion shows in the pop-up when the site opens and in the offers slider, only between its start and end dates and when it is switched on.</p>

      {form && (
        <form className="admin-form" onSubmit={save}>
          <h5>{form.id ? "Edit promotion" : "New promotion"}</h5>
          <div className="row g-3">
            <div className="col-md-6"><label>Title *</label><input className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="col-md-6"><label>Button</label>
              <select className="field" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })}>
                <option value="shop">Shop now (goes to shop)</option>
                <option value="whatsapp">Enquire now (opens WhatsApp)</option>
              </select>
            </div>
            <div className="col-12"><label>Text</label><textarea rows="2" className="field" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })}></textarea></div>
            <div className="col-md-4"><label>Start date</label><input type="date" className="field" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
            <div className="col-md-4"><label>End date</label><input type="date" className="field" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
            <div className="col-md-4 d-flex align-items-end"><label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Switched on</label></div>
            <div className="col-12">
              <label>Image (optional)</label>
              <div className="upload">
                {(form.image2 || form.image) && <div className="thumb-preview" style={{ backgroundImage: "url(" + (form.image2 || form.image) + ")" }}></div>}
                <input type="file" accept="image/*" onChange={onImage} />
              </div>
              {busy && <p className="muted small">Preparing image…</p>}
            </div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button className="btn-pink" disabled={busy}>Save promotion</button>
            <button type="button" className="btn-line" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="admin-list">
        {state.promos.length === 0 && <p className="muted">No promotions yet.</p>}
        {state.promos.map((p) => {
          const st = promoStatus(p);
          return (
            <div className="admin-row" key={p.id}>
              <div className="admin-thumb" style={{ backgroundImage: p.image ? "url(" + p.image + ")" : "linear-gradient(135deg,#e0418e,#17161a)" }}></div>
              <div className="flex-grow-1">
                <div className="fw-semibold">{p.title} <span className={"status " + st}>{badge[st]}</span></div>
                <div className="muted small">{p.start || "any time"} → {p.end || "no end"}</div>
              </div>
              <button className="btn-line small-btn" onClick={() => toggle(p)}>{p.active ? "Switch off" : "Switch on"}</button>
              <button className="btn-line small-btn" onClick={() => setForm({ ...p, image2: undefined })}>Edit</button>
              <button className="icon-plain danger" onClick={() => remove(p)} aria-label="Delete"><i className="fa-solid fa-trash-can"></i></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminPages({ state, update, flash }) {
  const [form, setForm] = useState(null);
  const save = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return flash("Enter a page title.");
    const data = { title: form.title.trim(), body: form.body.trim(), active: !!form.active };
    const pages = form.id
      ? state.pages.map((p) => (p.id === form.id ? { ...p, ...data } : p))
      : [...state.pages, { id: "pg" + Date.now(), ...data }];
    if (update({ ...state, pages })) { flash("Page saved ✔"); setForm(null); }
  };
  const remove = (p) => {
    if (window.confirm("Delete this page?")) update({ ...state, pages: state.pages.filter((x) => x.id !== p.id) }) && flash("Page deleted.");
  };
  return (
    <div>
      <div className="admin-bar">
        <h4>Pages</h4>
        <button className="btn-pink small-btn" onClick={() => setForm({ title: "", body: "", active: true })}><i className="fa-solid fa-plus me-1"></i>Add page</button>
      </div>
      <p className="muted small">Active pages appear in the menu and footer. Leave a blank line between paragraphs.</p>
      {form && (
        <form className="admin-form" onSubmit={save}>
          <h5>{form.id ? "Edit page" : "New page"}</h5>
          <div className="row g-3">
            <div className="col-md-8"><label>Title *</label><input className="field" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="col-md-4 d-flex align-items-end"><label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Show on site</label></div>
            <div className="col-12"><label>Content</label><textarea rows="8" className="field" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}></textarea></div>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button className="btn-pink">Save page</button>
            <button type="button" className="btn-line" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}
      <div className="admin-list">
        {state.pages.length === 0 && <p className="muted">No pages yet.</p>}
        {state.pages.map((p) => (
          <div className="admin-row" key={p.id}>
            <div className="flex-grow-1">
              <div className="fw-semibold">{p.title} {!p.active && <span className="status off">Hidden</span>}</div>
            </div>
            <button className="btn-line small-btn" onClick={() => setForm({ ...p })}>Edit</button>
            <button className="icon-plain danger" onClick={() => remove(p)} aria-label="Delete"><i className="fa-solid fa-trash-can"></i></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminSettings({ state, update, flash }) {
  const [s, setS] = useState({ ...state.settings, socials: { ...state.settings.socials } });
  const [pw, setPw] = useState({ user: state.auth.user, current: "", next: "" });
  const saveInfo = (e) => {
    e.preventDefault();
    if (update({ ...state, settings: s })) flash("Settings saved ✔");
  };
  const savePw = async (e) => {
    e.preventDefault();
    try {
      if ((await sha256(pw.current)) !== state.auth.hash) return flash("Current password is wrong.");
      if (pw.next.length < 6) return flash("New password needs at least 6 characters.");
      const hash = await sha256(pw.next);
      if (update({ ...state, auth: { user: pw.user.trim() || state.auth.user, hash } })) {
        flash("Login updated ✔");
        setPw({ user: pw.user, current: "", next: "" });
      }
    } catch (ex) { flash(ex.message); }
  };
  return (
    <div>
      <div className="admin-bar"><h4>Settings</h4></div>
      <form className="admin-form" onSubmit={saveInfo}>
        <h5>Business details</h5>
        <div className="row g-3">
          <div className="col-md-6"><label>Artist name</label><input className="field" value={s.artist} onChange={(e) => setS({ ...s, artist: e.target.value })} /></div>
          <div className="col-md-6"><label>Tagline</label><input className="field" value={s.tagline} onChange={(e) => setS({ ...s, tagline: e.target.value })} /></div>
          <div className="col-md-4"><label>Phone (shown)</label><input className="field" value={s.phone} onChange={(e) => setS({ ...s, phone: e.target.value })} /></div>
          <div className="col-md-4"><label>WhatsApp number (with 94)</label><input className="field" value={s.waNumber} onChange={(e) => setS({ ...s, waNumber: e.target.value.replace(/\D/g, "") })} /></div>
          <div className="col-md-4"><label>Email</label><input className="field" value={s.email} onChange={(e) => setS({ ...s, email: e.target.value })} /></div>
          {["facebook", "instagram", "tiktok", "youtube"].map((k) => (
            <div className="col-md-6" key={k}><label>{k[0].toUpperCase() + k.slice(1)} link</label>
              <input className="field" value={s.socials[k]} onChange={(e) => setS({ ...s, socials: { ...s.socials, [k]: e.target.value } })} />
            </div>
          ))}
          <div className="col-12"><label className="check"><input type="checkbox" checked={s.popupEnabled} onChange={(e) => setS({ ...s, popupEnabled: e.target.checked })} /> Show promotion pop-up when the site opens</label></div>
        </div>
        <button className="btn-pink mt-3">Save details</button>
      </form>

      <form className="admin-form" onSubmit={savePw}>
        <h5>Admin login</h5>
        <div className="row g-3">
          <div className="col-md-4"><label>Username</label><input className="field" value={pw.user} onChange={(e) => setPw({ ...pw, user: e.target.value })} /></div>
          <div className="col-md-4"><label>Current password</label><input className="field" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></div>
          <div className="col-md-4"><label>New password</label><input className="field" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
        </div>
        <button className="btn-line mt-3">Update login</button>
      </form>
    </div>
  );
}

function Admin({ state, update, onLogout }) {
  const [ok, setOk] = useState(() => sessionStorage.getItem("irshath_admin") === "1");
  const [tab, setTab] = useState("products");
  const [msg, setMsg] = useState("");
  const products = useMemo(() => buildProducts(state), [state]);
  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(""), 2600); return false; };
  const safeUpdate = (next) => {
    if (!update(next)) { flash("Storage is full. Use smaller images or fewer products."); return false; }
    return true;
  };
  if (!ok) return <AdminLogin state={state} onOk={() => setOk(true)} />;
  const tabs = [["products", "fa-box-open", "Products"], ["promos", "fa-bullhorn", "Promotions"], ["pages", "fa-file-lines", "Pages"], ["settings", "fa-gear", "Settings"]];
  return (
    <div className="admin">
      <aside className="admin-side">
        <a href="#home" className="brand small-brand"><span>{state.settings.artist}</span></a>
        {tabs.map(([k, ic, label]) => (
          <button key={k} className={"side-btn " + (tab === k ? "on" : "")} onClick={() => setTab(k)}>
            <i className={"fa-solid " + ic}></i> {label}
          </button>
        ))}
        <a href="#home" className="side-btn"><i className="fa-solid fa-arrow-up-right-from-square"></i> View site</a>
        <button className="side-btn" onClick={() => { sessionStorage.removeItem("irshath_admin"); onLogout(); }}><i className="fa-solid fa-right-from-bracket"></i> Log out</button>
      </aside>
      <main className="admin-main">
        {msg && <div className="admin-msg">{msg}</div>}
        {tab === "products" && <AdminProducts state={state} update={safeUpdate} products={products} flash={flash} />}
        {tab === "promos" && <AdminPromos state={state} update={safeUpdate} flash={flash} />}
        {tab === "pages" && <AdminPages state={state} update={safeUpdate} flash={flash} />}
        {tab === "settings" && <AdminSettings state={state} update={safeUpdate} flash={flash} />}
      </main>
    </div>
  );
}

/* ================= app ================= */
function App() {
  const [state, setState] = useState(loadState);
  const [route, setRoute] = useState(window.location.hash);
  const [cart, setCart] = useState({});
  const [cartOpen, setCartOpen] = useState(false);
  const [viewIdx, setViewIdx] = useState(null);
  const [checkout, setCheckout] = useState(false);
  const [justAdded, setJustAdded] = useState(null);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pageId, setPageId] = useState(null);
  const [popup, setPopup] = useState(false);

  const products = useMemo(() => buildProducts(state), [state]);
  const live = useMemo(() => state.promos.filter(isLive), [state.promos]);
  const settings = state.settings;
  const pages = state.pages;

  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // pop-up once per browser session, shortly after opening
  useEffect(() => {
    if (!settings.popupEnabled || route === "#admin") return;
    if (sessionStorage.getItem("irshath_promo_seen")) return;
    if (!live.length) return;
    const t = setTimeout(() => {
      setPopup(true);
      sessionStorage.setItem("irshath_promo_seen", "1");
    }, 2200);
    return () => clearTimeout(t);
  }, [route]);

  useReveal();

  useEffect(() => {
    const onDown = (e) => {
      const b = e.target.closest && e.target.closest("button.btn-pink,button.btn-line,button.btn-light-line,button.btn-wa,a.btn-pink,a.btn-line,a.btn-wa,button.icon-btn");
      if (!b) return;
      const r = b.getBoundingClientRect();
      const s = document.createElement("span");
      s.className = "ripple";
      s.style.left = e.clientX - r.left + "px";
      s.style.top = e.clientY - r.top + "px";
      b.appendChild(s);
      setTimeout(() => s.remove(), 650);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in")), 3000);
    return () => clearTimeout(t);
  }, [route]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    document.body.style.overflow = cartOpen || viewIdx !== null || checkout || popup || pageId ? "hidden" : "";
  }, [cartOpen, viewIdx, checkout, popup, pageId]);

  const items = Object.entries(cart)
    .map(([id, qty]) => ({ art: products.find((a) => a.id === id), qty }))
    .filter((i) => i.art);
  const count = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.art.price * i.qty, 0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((a) => a.name.toLowerCase().includes(q)) : products;
  }, [query, products]);

  const addToCart = (art) => {
    setCart((c) => ({ ...c, [art.id]: (c[art.id] || 0) + 1 }));
    setJustAdded(art.id);
    setToast(art.name + " added to cart 🛒");
    setTimeout(() => setJustAdded(null), 1000);
  };
  const changeQty = (id, d) =>
    setCart((c) => {
      const q = (c[id] || 0) + d;
      const n = { ...c };
      if (q <= 0) delete n[id];
      else n[id] = q;
      return n;
    });
  const removeItem = (id) => setCart((c) => { const n = { ...c }; delete n[id]; return n; });
  const buyNow = (art) => {
    const msg = [
      "🎨 New order - " + settings.artist,
      "",
      "Artwork: " + art.name,
      "Medium: " + art.medium,
      "Size: " + art.size,
      "Price: " + money(art.price),
      "",
      "I would like to buy this artwork. Please confirm availability and payment details. Thank you!",
    ].join("\n");
    window.open(waLink(settings.waNumber, msg), "_blank");
    setToast("Opening WhatsApp to place your order…");
  };
  const openView = (art) => setViewIdx(products.findIndex((a) => a.id === art.id));
  const enquire = (what) => window.open(waLink(settings.waNumber, "Hello " + settings.artist + ", I would like to order " + what + "."), "_blank");
  const promoAction = (p) => {
    setPopup(false);
    if (p.link === "whatsapp") enquire("a custom artwork");
    else document.getElementById("shop")?.scrollIntoView({ behavior: "smooth" });
  };
  const update = (next) => {
    if (!saveState(next)) return false;
    setState(next);
    return true;
  };

  if (route === "#admin") {
    return (
      <Ctx.Provider value={{ settings, pages, products }}>
        <Admin state={state} update={update} onLogout={() => { window.location.hash = "home"; }} />
      </Ctx.Provider>
    );
  }

  const heroSlides = products.slice(0, 5);
  const topSet = products.slice(5, 10);
  const page = pages.find((p) => p.id === pageId);

  return (
    <Ctx.Provider value={{ settings, pages, products }}>
      <Splash artist={settings.artist} />
      <Header
        count={count}
        onCart={() => setCartOpen(true)}
        query={query}
        setQuery={setQuery}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        onPage={setPageId}
      />
      <main>
        {heroSlides.length > 0 && <Hero slides={heroSlides} onAdd={addToCart} onView={openView} onBuy={buyNow} />}
        <Ticker />
        <PromoSlider promos={live} onAction={promoAction} />
        <TopPicks items={topSet.length ? topSet : heroSlides} onAdd={addToCart} onView={openView} onBuy={buyNow} />
        <Services products={products} onOrder={enquire} />
        <HowToOrder />
        <Shop items={filtered} onAdd={addToCart} onView={openView} justAdded={justAdded} onBuy={buyNow} />
        <Commission onOrder={enquire} />
        <About />
        <Contact />
      </main>
      <Footer />

      <a className="wa-float" href={waLink(settings.waNumber, "")} target="_blank" rel="noreferrer" aria-label="WhatsApp">
        <i className="fa-brands fa-whatsapp"></i>
      </a>

      {popup && live.length > 0 && <PromoPopup promos={live} onClose={() => setPopup(false)} onAction={promoAction} />}
      {page && <PageModal page={page} onClose={() => setPageId(null)} />}
      {cartOpen && (
        <CartDrawer
          items={items}
          total={total}
          onClose={() => setCartOpen(false)}
          onQty={changeQty}
          onRemove={removeItem}
          onCheckout={() => { setCartOpen(false); setCheckout(true); }}
        />
      )}
      {viewIdx !== null && (
        <ProductModal products={products} index={viewIdx} onIndex={setViewIdx} onClose={() => setViewIdx(null)} onAdd={addToCart} onBuy={buyNow} />
      )}
      {checkout && (
        <Checkout
          items={items}
          total={total}
          onClose={() => setCheckout(false)}
          onSent={() => { setCheckout(false); setCart({}); setToast("Order sent to WhatsApp ✔"); }}
        />
      )}
      {toast && <div className="toast-box">{toast}</div>}
    </Ctx.Provider>
  );
}

createRoot(document.getElementById("root")).render(<App />);
