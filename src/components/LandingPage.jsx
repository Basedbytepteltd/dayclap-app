import React, { useState, useEffect } from 'react'
import AuthModal from './AuthModal'
import { supabase } from '../supabaseClient'
import './LandingPage.css'
import { Calendar, Clock, Users, Star } from 'lucide-react'

// NEW: LandingPage now only handles the unauthenticated view and AuthModal
const LandingPage = ({ onAuthSuccess }) => {
  const [authMode, setAuthMode] = useState(null) // 'login' or 'signup'

  // Effect to ensure the landing page is always in light mode
  useEffect(() => {
    // Ensure dark-mode class is removed when on the landing page
    document.body.classList.remove('dark-mode')

    // No need to listen for system theme changes or apply dark mode here.
    // The App.jsx will handle user-specific theme preferences (including 'system')
    // once they are logged in.
    return () => {
      // Cleanup: No specific cleanup needed here as App.jsx will manage theme on login
    }
  }, [])

  const handleAuthSuccess = (user) => {
    // This function is called when AuthModal successfully logs in/signs up a user.
    // It then calls the onAuthSuccess prop passed from App.jsx to update global state.
    onAuthSuccess(user)
    setAuthMode(null) // Close the modal
  }

  return (
    <div className="landing-page">
      <header className="header">
        <div className="container">
          <div className="nav">
            <div className="logo">
              <Calendar className="logo-icon" />
              <span className="logo-text">DayClap</span>
            </div>
            <div className="nav-buttons">
              <button
                className="btn btn-outline"
                onClick={() => setAuthMode('login')}
              >
                Sign In
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setAuthMode('signup')}
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <h1 className="hero-title">
              Your Smart Calendar
              <span className="highlight"> Companion</span>
            </h1>
            <p className="hero-description">
              Streamline your schedule, manage tasks effortlessly, and never miss
              important meetings. DayClap brings all your productivity tools
              together in one beautiful interface.
            </p>
            <div className="hero-buttons">
              <button
                className="btn btn-primary btn-large"
                onClick={() => setAuthMode('signup')}
              >
                Start Free Today
              </button>
              <button className="btn btn-outline btn-large">Watch Demo</button>
            </div>
          </div>
          <div className="hero-image">
            <div className="calendar-preview">
              <div className="preview-header">
                <div className="preview-dots">
                  <div className="dot"></div>
                  <div className="dot"></div>
                  <div className="dot"></div>
                </div>
              </div>
              <div className="preview-content">
                <div className="preview-calendar">
                  <div className="calendar-header">
                    <h3>November 2024</h3>
                  </div>
                  <div className="calendar-grid">
                    <div className="calendar-days">
                      <span>S</span><span>M</span><span>T</span><span>W</span>
                      <span>T</span><span>F</span><span>S</span>
                    </div>
                    <div className="calendar-dates">
                      {Array.from({ length: 30 }, (_, i) => (
                        <div
                          key={i}
                          className={`calendar-date ${
                            i === 14 ? 'active' : ''
                          } ${i === 20 || i === 25 ? 'has-event' : ''}`}
                        >
                          {i + 1}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">
              Everything you need to stay organized
            </h2>
            <p className="section-description">
              Powerful features designed to boost your productivity
            </p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <Calendar />
              </div>
              <h3 className="feature-title">Smart Scheduling</h3>
              <p className="feature-description">
                Intelligent calendar management with automatic conflict detection
                and scheduling suggestions.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Clock />
              </div>
              <h3 className="feature-title">Task Management</h3>
              <p className="feature-description">
                Keep track of your to-dos, set priorities, and never miss a
                deadline with our integrated task system.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Users />
              </div>
              <h3 className="feature-title">Team Collaboration</h3>
              <p className="feature-description">
                Share calendars, send invitations, and coordinate with your team
                seamlessly across organizations.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Star />
              </div>
              <h3 className="feature-title">Smart Insights</h3>
              <p className="feature-description">
                Get intelligent insights about your productivity patterns and
                optimize your daily routine.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="container">
          <div className="cta-content">
            <h2 className="cta-title">Ready to transform your productivity?</h2>
            <p className="cta-description">
              Join thousands of professionals who've already made the switch to
              smarter scheduling.
            </p>
            <button
              className="btn btn-primary btn-large"
              onClick={() => setAuthMode('signup')}
            >
              Get Started Free
            </button>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <div className="logo">
                <Calendar className="logo-icon" />
                <span className="logo-text">DayClap</span>
              </div>
              <p className="footer-description">
                Your smart calendar companion for better productivity.
              </p>
            </div>
            <div className="footer-section">
              <h4>Product</h4>
              <ul className="footer-links">
                <li>
                  <a href="#features">Features</a>
                </li>
                <li>
                  <a href="#pricing">Pricing</a>
                </li>
                <li>
                  <a href="#integrations">Integrations</a>
                </li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Company</h4>
              <ul className="footer-links">
                <li>
                  <a href="#about">About</a>
                </li>
                <li>
                  <a href="#careers">Careers</a>
                </li>
                <li>
                  <a href="#contact">Contact</a>
                </li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Support</h4>
              <ul className="footer-links">
                <li>
                  <a href="#help">Help Center</a>
                </li>
                <li>
                  <a href="#privacy">Privacy</a>
                </li>
                <li>
                  <a href="#terms">Terms</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} DayClap. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSwitchMode={setAuthMode}
          onAuthSuccess={handleAuthSuccess}
        />
      )}
    </div>
  )
}

export default LandingPage
