import React from "react";

const REPO = "https://github.com/khayamumair/waitwise";
const DEMO = "https://github.com/user-attachments/assets/9ca24dfe-ee13-4a11-875f-9602ba21a764";
const GOV = "https://www.gov.uk/government/news/new-backing-for-open-source-ai-builders-data-centre-design-challenge-and-robotics-partnership";
const LINKEDIN = "https://www.linkedin.com/feed/update/urn:li:activity:7472927014358925312";
const CONTACT_EMAIL = "khayamumair@gmail.com"; // TODO: swap for hello@waitwise.co.uk once the domain is registered
const CONTACT = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("WaitWise enquiry")}`;

const asset = (p) => `${import.meta.env.BASE_URL}${p}`;

/* ------------------------------------------------------------------
   Thin line icons (stroke = currentColor). Kept minimal and uniform
   so the UI stays clean, no emoji anywhere.
   ------------------------------------------------------------------ */
const PATHS = {
  check: <path d="M20 6 9 17l-5-5" />,
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  scan: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  flask: <><path d="M9 3h6" /><path d="M10 3v6l-5.2 9.3A2 2 0 0 0 6.6 21h10.8a2 2 0 0 0 1.8-2.7L14 9V3" /><path d="M7.5 15h9" /></>,
  pulse: <path d="M22 12h-4l-3 8-6-16-3 8H2" />,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></>,
  star: <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 18.5 6.1 21.3l1.2-6.6L2.5 9.5l6.6-.9z" fill="currentColor" stroke="none" />,
  heart: <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7A5 5 0 1 0 3.2 12.7l1.7 1.7L12 21l7.1-6.6 1.7-1.7a5 5 0 0 0 0-7.1z" />,
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/* Partner / backer logos for the carousel */
const logos = [
  { img: "logos/nvidia.svg", name: "NVIDIA" },
  { img: "logos/elevenlabs.svg", name: "ElevenLabs" },
  { img: "logos/mozilla.svg", name: "Mozilla" },
  { txt: "DSIT", sub: "UK Government" },
  { txt: "i.AI", sub: "Government AI" },
  { txt: "Hack for Impact", sub: "London Tech Week 2026" },
];

const loop = [
  ["scan", "Read the whole list", "It ingests the entire waiting list, not a sample."],
  ["flag", "Surface who is at risk", "Auditable rules flag the patients quietly falling behind."],
  ["pulse", "Assess and prioritise", "Every case is triaged against current NHS guidance."],
  ["mail", "Draft the outreach", "A referral memo and a patient letter, ready for review."],
  ["shield", "A human decides", "A coordinator or GP approves every action. Always."],
];

const services = [
  ["scan", "Read the whole list", "WaitWise ingests an entire waiting list and understands the pathway behind every patient, so nobody is invisible to the system."],
  ["flag", "Find who is slipping", "It surfaces the patients falling through the gaps: long breaches never contacted, changes never reviewed, deprived patients going silent."],
  ["mail", "Prepare the outreach", "For each priority patient it drafts a clinician ready referral and a compassionate letter, grounded in NHS guidance."],
];

function Check() { return <Icon name="check" />; }

function LogoItem({ item }) {
  return (
    <div className="logo-item">
      {item.img && <img src={asset(item.img)} alt={item.name} />}
      <span className="txt">{item.name || item.txt}{item.sub && <small>{item.sub}</small>}</span>
    </div>
  );
}

function Wordmark({ dark }) {
  return (
    <span className="brand" style={dark ? { color: "#fff" } : undefined}>
      waitwise
    </span>
  );
}

const NAV_LINKS = [
  ["#problem", "The problem"],
  ["#how", "How it works"],
  ["#recognition", "Recognition"],
  ["#demo", "Demo"],
];

function Nav() {
  const [open, setOpen] = React.useState(false);
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Wordmark />
        <nav className="nav-links">
          {NAV_LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          <a className="btn btn-primary" href={CONTACT}>Get in touch</a>
          <button
            className="nav-toggle"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </nav>
      </div>
      {open && (
        <nav className="nav-mobile" onClick={() => setOpen(false)}>
          {NAV_LINKS.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
          <a href={CONTACT}>Get in touch</a>
        </nav>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow">Supported by the UK Government, NVIDIA, ElevenLabs and Mozilla</span>
          <h1>Nobody should fall through the cracks of an <em>NHS waiting list.</em></h1>
          <div className="hero-trust">
            <span className="award"><Icon name="star" /></span>
            Winners at NVIDIA Hack for Impact, London Tech Week 2026
          </div>
          <div className="hero-cta">
            <a className="btn btn-primary" href="#demo"><Icon name="play" /> Watch the demo</a>
            <a className="btn btn-ghost" href={REPO} target="_blank" rel="noopener">Explore the project</a>
          </div>
          <p className="lead">
            WaitWise reads an entire elective waiting list, finds the patients slipping
            through the gaps, and prepares reviewed, clinician ready outreach. It runs on
            device, so patient data never leaves the building.
          </p>
          <ul className="checks">
            <li><Check /> Reads every patient, not a sample</li>
            <li><Check /> Surfaces who is quietly falling behind</li>
            <li><Check /> A clinician approves every action</li>
          </ul>
        </div>
        <aside className="hero-card">
          <div className="hero-card-head">
            <span className="cap">How the loop works</span>
            <span className="live"><i></i> On-device</span>
          </div>
          <ol className="loop">
            {loop.map(([ic, t, d], i) => (
              <li className="loop-step" key={i}>
                <span className="dot"><Icon name={ic} /></span>
                <div className="loop-body"><b>{t}</b><span>{d}</span></div>
                <span className="step-n">{String(i + 1).padStart(2, "0")}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}

function Carousel() {
  const track = [...logos, ...logos]; // duplicated for a seamless loop
  return (
    <div className="marquee-wrap">
      <div className="wrap"><div className="label">Supported and funded by</div></div>
      <div className="marquee">
        <div className="marquee-track">
          {track.map((item, i) => <LogoItem key={i} item={item} />)}
        </div>
      </div>
    </div>
  );
}

function Problem() {
  const stats = [
    ["7.11M", "people are on the NHS waiting list."],
    ["65.3%", "are seen in 18 weeks, against a 92% standard."],
    ["2x", "longer waits if you live in the most deprived areas."],
  ];
  return (
    <section id="problem">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">The problem</span>
          <h2>The waiting list is measured. Coordination is not.</h2>
          <p className="lead">Today's tools clean and validate lists. None of them continuously find the patients quietly falling through the cracks. WaitWise is that missing layer.</p>
        </div>
        <div className="grid-3">
          {stats.map(([v, k], i) => (
            <div className="stat" key={i}><div className="v">{v}</div><div className="k">{k}</div></div>
          ))}
        </div>
        <p className="center" style={{ color: "var(--ink-3)", marginTop: 24, fontSize: ".9rem" }}>Sources: NHS England, ONS and The King's Fund.</p>
      </div>
    </section>
  );
}

function How() {
  return (
    <section id="how" className="soft">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">How WaitWise works</span>
          <h2>From a raw list to reviewed outreach</h2>
          <p className="lead">Simple to describe, careful by design. WaitWise hands clinicians a shortlist and a draft, never a decision.</p>
        </div>
        <div className="grid-3">
          {services.map(([ic, t, d], i) => (
            <div className="card" key={i}>
              <div className="ic"><Icon name={ic} /></div>
              <h3>{t}</h3>
              <p>{d}</p>
              <a className="more" href="#demo">See it in the demo →</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Demo() {
  return (
    <section id="demo">
      <div className="wrap">
        <div className="band">
          <div className="inner">
            <div>
              <span className="eyebrow">See it run</span>
              <h2 style={{ margin: "10px 0 16px" }}>The full pipeline, end to end</h2>
              <p>From a raw waiting list to reviewed referrals and an autonomous patient call, running live on device.</p>
              <ul className="checks on-dark">
                <li><Check /> Reads a 10,000 patient list in one pass</li>
                <li><Check /> Drafts referrals and letters for review</li>
                <li><Check /> Phones patients with a voice agent</li>
              </ul>
            </div>
            <div className="video">
              <video controls preload="metadata" playsInline poster={asset("architecture.svg")}>
                <source src={DEMO} type="video/mp4" />
                Your browser cannot play this video. <a href={REPO}>Watch it on GitHub.</a>
              </video>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Recognition() {
  return (
    <section id="recognition">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Recognition and support</span>
          <h2>Backed by the people building the UK's AI future</h2>
          <p className="lead">An early stage venture, already supported by government, industry and the open source community.</p>
        </div>
        <div className="grid-3" style={{ alignItems: "stretch" }}>
          <div className="prize">
            <div className="top"><span className="tag">Winner</span><span className="worth">DGX Spark · ~£5,000</span></div>
            <h3>NVIDIA Public Services Prize</h3>
            <p>Top prize in the Public Services track at Hack for Impact, London Tech Week 2026, including an NVIDIA DGX Spark.</p>
          </div>
          <div className="prize">
            <div className="top"><span className="tag" style={{ background: "var(--ink)" }}>Winner</span></div>
            <h3>ElevenLabs, Best Use of Voice</h3>
            <p>Recognised and supported by ElevenLabs for the autonomous voice agent that phones patients to check in.</p>
          </div>
          <div className="prize">
            <div className="top"><span className="tag" style={{ background: "#0fa47f" }}>Grant</span><span className="worth">£10,000</span></div>
            <h3>Mozilla</h3>
            <p>A £10,000 grant backing the open source, public interest mission behind WaitWise.</p>
          </div>
        </div>

        <div className="prize wide">
          <div className="top">
            <span className="tag" style={{ background: "var(--brand-strong)" }}>UK Government</span>
            <span className="worth">20,000 GPU hours</span>
          </div>
          <h3>Selected for the Open Source AI Builder Pack</h3>
          <p style={{ maxWidth: "72ch" }}>Championed by Kanishka Narayan MP, Minister for AI and Online Safety, and delivered with DSIT. The pack gives the team real compute, mentoring and a seat at the table.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 8 }}>
            <ul><li><b>20,000 hours</b> of GPU compute</li><li>Technical expertise through <b>i.AI</b> mentoring</li></ul>
            <ul><li>A seat on an <b>Open Source AI board</b>, anchored by the Minister</li><li>Direct engagement with <b>DSIT</b></li></ul>
          </div>
          <div className="src" style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
            <a href={GOV} target="_blank" rel="noopener">Read the government announcement →</a>
            <a href={LINKEDIN} target="_blank" rel="noopener">See it on LinkedIn →</a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Why() {
  const feats = [
    ["Private by design", "Patient data is processed on the device. No cloud model, nothing sent away."],
    ["Fast enough to matter", "It works through a full cohort in minutes, not one patient at a time."],
    ["Auditable throughout", "Every flag, draft and approval is logged. No black box deciding who waits."],
  ];
  return (
    <section className="soft">
      <div className="wrap grid-2">
        <div>
          <span className="eyebrow">Why it is different</span>
          <h2 style={{ margin: "10px 0 16px" }}>All the intelligence. None of the data leaving the room.</h2>
          <p className="lead" style={{ marginBottom: 26 }}>WaitWise was built privacy first. The reasoning happens on hardware inside the trust, the only footing on which NHS data governance holds.</p>
          {feats.map(([t, d], i) => (
            <div className="feat" key={i}><span className="tick"><Check /></span><div><h3>{t}</h3><p>{d}</p></div></div>
          ))}
        </div>
        <div className="arch"><img src={asset("architecture.svg")} alt="WaitWise architecture diagram: dashboard and pipeline run on-premises, the model runs on an NVIDIA DGX Spark" loading="lazy" /></div>
      </div>
    </section>
  );
}

function Photo({ file, name, sub }) {
  const [failed, setFailed] = React.useState(false);
  return (
    <figure className="photo" style={{ margin: 0 }}>
      {failed
        ? <div className="ph">Save the photo as<br /><code>landing/public/{file}</code></div>
        : <img src={asset(file)} alt={name} loading="lazy" onError={() => setFailed(true)} />}
      <figcaption className="cap"><b>{name}</b><span>{sub}</span></figcaption>
    </figure>
  );
}

function Team() {
  const vals = [
    ["flask", "Researchers", "Grounded in open NHS and ONS data, with methods that stand up to scrutiny."],
    ["pulse", "Healthcare builders", "A team that has shipped healthcare products and knows the pathway."],
    ["shield", "Secure by principle", "On device by default. Data governance first, features second."],
    ["heart", "A borne duty", "We build this because the system can be better, and people waiting deserve it."],
  ];
  return (
    <section id="team">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">Who we are</span>
          <h2>Researchers and healthcare builders, fixing the system from the inside</h2>
        </div>
        <div className="photos" style={{ marginBottom: 56 }}>
          <Photo file="assets/team-hackathon.jpg" name="Winners, NVIDIA Public Services Prize" sub="Hack for Impact, London Tech Week 2026." />
          <Photo file="assets/team-ai-summit.jpg" name="With the Minister for AI" sub="Kanishka Narayan MP at The AI Summit London." />
        </div>
        <div className="grid-4">
          {vals.map(([ic, t, d], i) => (
            <div className="value" key={i}><div className="ic"><Icon name={ic} /></div><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="wrap top">
        <div className="cols">
          <div className="left">
            <div style={{ marginBottom: 22 }}><Wordmark dark /></div>
            <h2>Let's fix the waiting list together.</h2>
            <a className="btn btn-white" href={CONTACT} style={{ marginTop: 10 }}>Get in touch</a>
          </div>
          <div className="right">
            <h4>Start a conversation</h4>
            <p style={{ color: "#aeb4bd" }}>NHS partners, pilots and collaborators welcome.</p>
            <form
              className="contact"
              onSubmit={(e) => {
                e.preventDefault();
                const from = new FormData(e.currentTarget).get("email") || "";
                const subject = encodeURIComponent("WaitWise enquiry");
                const body = encodeURIComponent(`Hi WaitWise team,\n\n\n\nReply to: ${from}`);
                window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
              }}
            >
              <input type="email" name="email" required placeholder="Your email" aria-label="Your email" />
              <button className="btn btn-primary" type="submit">Send</button>
            </form>
            <div className="links">
              <div>
                <h5>Project</h5>
                <a href={REPO} target="_blank" rel="noopener">GitHub</a>
                <a href="#demo">Demo</a>
                <a href="#how">How it works</a>
              </div>
              <div>
                <h5>Recognition</h5>
                <a href={GOV} target="_blank" rel="noopener">Government announcement</a>
                <a href={LINKEDIN} target="_blank" rel="noopener">LinkedIn</a>
                <a href="#recognition">Awards and grants</a>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="wrap"><div className="fine">© 2026 WaitWise. Supported by DSIT, NVIDIA, ElevenLabs, Mozilla and i.AI. All data shown is synthetic. WaitWise recommends, it does not make clinical decisions.</div></div>
    </footer>
  );
}

export default function App() {
  return (
    <>
      <Nav />
      <Hero />
      <Carousel />
      <Problem />
      <How />
      <Demo />
      <Recognition />
      <Why />
      <Team />
      <Footer />
    </>
  );
}
