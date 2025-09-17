import React, { useState, useEffect } from "react";
import AuthModal from "./AuthModal";
import Dashboard from "./Dashboard";
import SuperAdminDashboard from "./SuperAdminDashboard";
import { supabase } from '../supabaseClient';
import "./LandingPage.css";
import { Calendar, Clock, Users, Star } from "lucide-react";

const LandingPage = () => {
  const [authMode, setAuthMode] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Debug log for authMode changes
  useEffect(() => {
    console.log('LandingPage: authMode state changed to:', authMode);
  }, [authMode]);

  useEffect(() => {
    setLoading(true);

    const handleAuthSession = async (session) => {
      console.log('LandingPage: handleAuthSession called with session:', session);
      if (!session) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError && profileError.code === 'PGRST116') { // No profile found, create one
          const userName = session.user.user_metadata?.name || session.user.email.split('@')[0];
          // Removed userCompany as it's no longer collected at signup
          // const userCompany = session.user.user_metadata?.company || null;

          // Simplified: No company is created at initial signup
          let initialCompanies = [];
          let initialCurrentCompanyId = null;
          // Removed conditional logic for creating company based on userCompany

          const { data: newProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: session.user.id,
              name: userName,
              email: session.user.email,
              company_name: null, // Default to null as company is not provided at signup
              companies: initialCompanies,
              current_company_id: initialCurrentCompanyId,
              last_activity_at: new Date().toISOString(),
              currency: 'USD'
            })
            .select()
            .single();
          
          if (insertError) throw insertError;
          profile = newProfile;
        } else if (profileError) {
          throw profileError;
        }

        // Combine user and profile data
        const combinedUserData = {
          ...session.user,
          ...profile,
          companies: profile.companies || [],
          currentCompanyId: profile.current_company_id,
          currency: profile.currency || 'USD',
        };
        setUser(combinedUserData);

      } catch (error) {
        console.error("LandingPage: Error handling auth session:", error.message);
        setUser(session.user); // Fallback to auth user data if profile fails
      } finally {
        setLoading(false);
      }
    };

    // Initial check for an existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthSession(session);
    }).catch(err => {
        console.error("LandingPage: Error getting initial session:", err);
        setUser(null);
        setLoading(false);
    });

    // Listener for auth state changes (login, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('LandingPage: Auth state changed event:', _event, 'Session:', session);
      handleAuthSession(session);
    });

    // Cleanup listener on component unmount
    return () => {
      subscription?.unsubscribe();
    };
  }, []);


  useEffect(() => {
    const applyTheme = (theme) => {
      document.body.classList.remove('dark-mode'); 

      if (theme === 'dark') {
        document.body.classList.add('dark-mode');
      } else if (theme === 'light') {
        // Light theme selected, ensuring dark-mode is removed.
      } else if (theme === 'system') {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.body.classList.add('dark-mode');
        } else {
          // System theme (light) applied.
        }
      }
    };

    if (!loading) {
      if (user) {
        applyTheme(user.theme);

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleSystemThemeChange = (e) => {
          if (user.theme === 'system') {
            document.body.classList.remove('dark-mode');
            if (e.matches) {
              document.body.classList.add('dark-mode');
            } else {
              // System theme (light) re-applied due to system change.
            }
          }
        };

        mediaQuery.addEventListener('change', handleSystemThemeChange);

        return () => {
          mediaQuery.removeEventListener('change', handleSystemThemeChange);
          document.body.classList.remove('dark-mode');
        };
      } else {
        document.body.classList.remove('dark-mode');
      }
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [user?.theme, user, loading]);


  const handleAuthSuccess = (supabaseUser) => {
    console.log('LandingPage: Auth success, closing modal.');
    setAuthMode(null);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("LandingPage: Error logging out:", error.message);
    }
    setUser(null);
    setAuthMode(null);
    console.log('LandingPage: User logged out.');
  };

  const handleUserUpdate = async (updatedUser) => {
    const { id, name, email, theme, language, timezone, notifications, privacy, company_name, companies, currentCompanyId, currency } = updatedUser;
    
    const { data, error } = await supabase
      .from('profiles')
      .update({ 
        name, 
        email, 
        theme, 
        language, 
        timezone, 
        notifications, 
        privacy, 
        company_name,
        companies,
        current_company_id: currentCompanyId,
        last_activity_at: new Date().toISOString(),
        currency
      })
      .eq('id', id);

    if (error) {
      console.error("LandingPage: Error updating user profile in Supabase:", error.message);
      console.error("LandingPage: Full Supabase update error object:", error);
    } else {
      const { data: freshProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error("LandingPage: Error re-fetching profile after update:", fetchError);
        setUser(updatedUser);
      } else {
        const combinedFreshUserData = {
          ...updatedUser,
          ...freshProfile,
          companies: freshProfile.companies || [],
          currentCompanyId: freshProfile.current_company_id,
          currency: freshProfile.currency,
        };
        setUser(combinedFreshUserData);
      }
    }
  };

  if (loading) {
    console.log('LandingPage: Rendering loading screen.');
    return (
      <div className="loading-screen">
        <div className="loading-calendar">
          <div className="loading-calendar-header">Loading Calendar...</div>
          <div className="loading-calendar-grid">
            {Array.from({ length: 25 }, (_, i) => (
              <div key={i} className="loading-date">{i + 1}</div>
            ))}
          </div>
        </div>
        <p>Loading DayClap...</p>
      </div>
    );
  }

  const isSuperAdmin = user && user.email === 'admin@example.com';

  if (user) {
    console.log('LandingPage: User is logged in, rendering dashboard.');
    if (isSuperAdmin) {
      return <SuperAdminDashboard user={user} onLogout={handleLogout} />;
    } else {
      return <Dashboard user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />;
    }
  }

  console.log('LandingPage: User is NOT logged in, rendering landing page content.');
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
                onClick={() => { console.log('Super Admin Login button clicked'); setAuthMode('login'); }}
              >
                Super Admin Login
              </button>
              <button 
                className="btn btn-outline"
                onClick={() => { console.log('Sign In button clicked'); setAuthMode('login'); }}
              >
                Sign In
              </button>
              <button 
                className="btn btn-primary"
                onClick={() => { console.log('Get Started button clicked (header)'); setAuthMode('signup'); }}
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
              Streamline your schedule, manage tasks effortlessly, and never miss important meetings. 
              DayClap brings all your productivity tools together in one beautiful interface.
            </p>
            <div className="hero-buttons">
              <button 
                className="btn btn-primary btn-large"
                onClick={() => { console.log('Start Free Today button clicked (hero)'); setAuthMode('signup'); }}
              >
                Start Free Today
              </button>
              <button className="btn btn-outline btn-large">
                Watch Demo
              </button>
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
                      <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
                    </div>
                    <div className="calendar-dates">
                      {Array.from({ length: 30 }, (_, i) => (
                        <div key={i} className={`calendar-date ${i === 14 ? 'active' : ''} ${i === 20 || i === 25 ? 'has-event' : ''}`}>
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
            <h2 className="section-title">Everything you need to stay organized</h2>
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
                Intelligent calendar management with automatic conflict detection and scheduling suggestions.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Clock />
              </div>
              <h3 className="feature-title">Task Management</h3>
              <p className="feature-description">
                Keep track of your to-dos, set priorities, and never miss a deadline with our integrated task system.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Users />
              </div>
              <h3 className="feature-title">Team Collaboration</h3>
              <p className="feature-description">
                Share calendars, send invitations, and coordinate with your team seamlessly across organizations.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Star />
              </div>
              <h3 className="feature-title">Smart Insights</h3>
              <p className="feature-description">
                Get intelligent insights about your productivity patterns and optimize your daily routine.
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
              Join thousands of professionals who've already made the switch to smarter scheduling.
            </p>
            <button 
              className="btn btn-primary btn-large"
              onClick={() => { console.log('Get Started Free button clicked (CTA)'); setAuthMode('signup'); }}
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
                <li><a href="#features">Features</a></li>
                <li><a href="#pricing">Pricing</a></li>
                <li><a href="#integrations">Integrations</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Company</h4>
              <ul className="footer-links">
                <li><a href="#about">About</a></li>
                <li><a href="#careers">Careers</a></li>
                <li><a href="#contact">Contact</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Support</h4>
              <ul className="footer-links">
                <li><a href="#help">Help Center</a></li>
                <li><a href="#privacy">Privacy</a></li>
                <li><a href="#terms">Terms</a></li>
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
          onClose={() => { console.log('AuthModal onClose called'); setAuthMode(null); }}
          onSwitchMode={setAuthMode}
          onAuthSuccess={handleAuthSuccess}
        />
      )}
    </div>
  );
};

export default LandingPage;
