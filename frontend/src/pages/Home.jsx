import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import SafeImg from "../components/SafeImg.jsx";

const HERO_IMG =
  "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1400&q=70";
const STUDY_IMG =
  "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=900&q=70";
const CLASS_IMG =
  "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=900&q=70";
const ONLINE_IMG =
  "https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&w=900&q=70";

export default function Home() {
  const navigate = useNavigate();
  const { isAuthenticated, userType } = useAuth();
  const [contact, setContact] = useState(null);
  const [homeQuery, setHomeQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    // GET /api/contact/ — real backend contact message.
    endpoints
      .contact()
      .then((data) => {
        if (!cancelled) setContact(data);
      })
      .catch(() => {
        if (!cancelled) setContact(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function scrollToPlans() {
    document.getElementById("subscription-plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleHeroSearch(e) {
    e.preventDefault();
    const q = homeQuery.trim();
    navigate(q ? `/teachers?q=${encodeURIComponent(q)}` : "/teachers");
  }

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Learn from expert teachers</p>
          <h1>Education that moves at your pace</h1>
          <p className="muted">
            Browse qualified teachers, subscribe to their courses, and unlock lectures,
            lesson content, and homework — all in one place.
          </p>
          <form className="hero-search" onSubmit={handleHeroSearch} role="search">
            <span className="hero-search-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" x2="16.65" y1="21" y2="16.65" />
              </svg>
            </span>
            <input
              type="search"
              placeholder="Search for courses, teachers or topics..."
              value={homeQuery}
              onChange={(e) => setHomeQuery(e.target.value)}
              aria-label="Search courses, teachers or topics"
            />
            <button type="submit" className="hero-search-btn" aria-label="Search" title="Search">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <circle cx="11" cy="11" r="7" />
                <line x1="21" x2="16.65" y1="21" y2="16.65" />
              </svg>
            </button>
          </form>
          <div className="btn-row">
            <button type="button" className="btn btn-dark" onClick={() => navigate("/teachers")}>
              Find a teacher
            </button>
            {!isAuthenticated ? (
              <button type="button" className="btn btn-ghost" onClick={() => navigate("/login")}>
                Login
              </button>
            ) : userType === "admin" ? (
              <button type="button" className="btn btn-ghost" onClick={() => navigate("/admin/dashboard")}>
                Go to admin dashboard
              </button>
            ) : userType === "teacher" ? (
              <button type="button" className="btn btn-ghost" onClick={() => navigate("/teacher/dashboard")}>
                Go to my dashboard
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => navigate("/teachers")}>
                Continue learning
              </button>
            )}
          </div>
        </div>
        <div className="hero-media img-zoom">
          <SafeImg className="zoom-img" src={HERO_IMG} alt="Graduates celebrating together on campus" label="Education System" eager />
        </div>
      </section>

      <section className="section">
        <h2>How it works</h2>
        <div className="cards-3">
          <div className="card img-zoom">
            <div className="card-media">
              <SafeImg className="zoom-img" src={STUDY_IMG} alt="Student taking notes while studying" label="Discover teachers" />
            </div>
            <h3>1. Discover teachers</h3>
            <p className="muted">Search verified teachers by name, subject, and grade.</p>
            <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/teachers")}>
              Browse teachers
            </button>
          </div>
          <div className="card img-zoom">
            <div className="card-media">
              <SafeImg className="zoom-img" src={CLASS_IMG} alt="Teacher leading a classroom lesson" label="Subscribe" />
            </div>
            <h3>2. Subscribe</h3>
            <p className="muted">Pick a plan — 1, 3, 6, or 12 months — and confirm payment.</p>
            {isAuthenticated && userType === "student" ? (
              <div className="btn-row">
                <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/my-subscriptions")}>
                  My subscriptions
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={scrollToPlans}>
                  How plans work
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-dark btn-sm" onClick={scrollToPlans}>
                See how plans work
              </button>
            )}
          </div>
          <div className="card img-zoom">
            <div className="card-media">
              <SafeImg className="zoom-img" src={ONLINE_IMG} alt="Student learning online with a laptop" label="Learn" />
            </div>
            <h3>3. Learn</h3>
            <p className="muted">Unlock lectures, lesson content, and homework for your teachers.</p>
            {!isAuthenticated ? (
              <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/register")}>
                Create account
              </button>
            ) : (
              <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/profile")}>
                My profile
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="section" id="subscription-plans" aria-label="Subscription plans">
        <h2>Subscription plans</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Each teacher offers 1, 3, 6, and 12-month plans with their own prices. Pick a teacher to see
          exact prices, then confirm payment to unlock their lectures, lesson content, and homework.
        </p>
        <div className="cards-3">
          {[
            { label: "1 month", hint: "Flexible start, renew monthly." },
            { label: "3 months", hint: "A full term of guided learning." },
            { label: "6 months", hint: "Steady progress across two terms." },
            { label: "12 months", hint: "Best value for the full year." },
          ].map((plan) => (
            <div key={plan.label} className="card">
              <h3 style={{ marginTop: 0 }}>{plan.label}</h3>
              <p className="muted">{plan.hint}</p>
            </div>
          ))}
        </div>
        <div className="btn-row">
          {isAuthenticated && userType === "student" ? (
            <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/my-subscriptions")}>
              Go to my subscriptions
            </button>
          ) : isAuthenticated && userType === "teacher" ? (
            <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/teacher/dashboard")}>
              Go to my dashboard
            </button>
          ) : isAuthenticated && userType === "admin" ? (
            <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/admin/dashboard")}>
              Go to admin dashboard
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/teachers")}>
                Choose a teacher to see prices
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/register")}>
                Create account
              </button>
            </>
          )}
        </div>
      </section>

      <section className="section contact-strip">
        <div>
          <h2>Need help?</h2>
          <p className="muted">{contact && contact.message ? contact.message : "Contact our support team for assistance."}</p>
        </div>
        {!isAuthenticated && (
          <button type="button" className="btn btn-dark" onClick={() => navigate("/register")}>
            Join now
          </button>
        )}
      </section>
    </div>
  );
}
