import React, { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom' // NEW: Import routing components
import LandingPage from './components/LandingPage'
import Dashboard from './components/Dashboard'
import SuperAdminDashboard from './components/SuperAdminDashboard'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate() // NEW: For programmatic navigation

  useEffect(() => {
    setLoading(true)

    const handleAuthSession = async (session) => {
      if (!session) {
        setUser(null)
        setLoading(false)
        return
      }

      try {
        let { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()

        if (profileError) {
          console.warn('App: Profile not found for user, relying on trigger or user action.')
          setUser({
            ...session.user,
            name: session.user.user_metadata?.name || session.user.email.split('@')[0],
            email: session.user.email,
            companies: [],
            currentCompanyId: null,
            currency: 'USD',
            theme: 'light',
            language: 'en',
            timezone: 'UTC',
            notifications: {
              email_daily: true,
              email_weekly: false,
              email_monthly: false,
              email_3day_countdown: false,
              push: true,
              reminders: true,
              invitations: true,
            },
            privacy: {
              profileVisibility: 'team',
              calendarSharing: 'private',
            },
            account_type: session.user.user_metadata?.account_type || 'personal',
          })
          setLoading(false)
          return
        }

        const combinedUserData = {
          ...session.user,
          ...profile,
          companies: profile.companies || [],
          currentCompanyId: profile.current_company_id,
          currency: profile.currency || 'USD',
          account_type: profile.account_type || 'personal',
        }
        setUser(combinedUserData)
      } catch (error) {
        console.error('App: Error handling auth session:', error.message)
        setUser(session.user)
      } finally {
        setLoading(false)
      }
    }

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        handleAuthSession(session)
      })
      .catch((err) => {
        console.error('App: Error getting initial session:', err)
        setUser(null)
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthSession(session)
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const applyTheme = (theme) => {
      document.body.classList.remove('dark-mode')

      if (theme === 'dark') {
        document.body.classList.add('dark-mode')
      } else if (theme === 'system') {
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.body.classList.add('dark-mode')
        }
      }
    }

    if (!loading) {
      if (user) {
        applyTheme(user.theme)

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        const handleSystemThemeChange = (e) => {
          if (user.theme === 'system') {
            document.body.classList.toggle('dark-mode', e.matches)
          }
        }

        mediaQuery.addEventListener('change', handleSystemThemeChange)

        return () => {
          mediaQuery.removeEventListener('change', handleSystemThemeChange)
          document.body.classList.remove('dark-mode')
        }
      } else {
        document.body.classList.remove('dark-mode')
      }
    } else {
      document.body.classList.remove('dark-mode')
    }
  }, [user?.theme, user, loading])

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('App: Error logging out:', error.message)
    }
    setUser(null)
    navigate('/') // Redirect to landing page after logout
  }

  const handleUserUpdate = async (updatedUser) => {
    const {
      id,
      name,
      email,
      theme,
      language,
      timezone,
      notifications,
      privacy,
      company_name,
      companies,
      currentCompanyId,
      currency,
      account_type,
    } = updatedUser

    const { error } = await supabase
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
        currency,
        account_type,
      })
      .eq('id', id)

    if (error) {
      console.error('App: Error updating user profile in Supabase:', error.message)
    } else {
      const { data: freshProfile, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) {
        console.error('App: Error re-fetching profile after update:', fetchError)
        setUser(updatedUser)
      } else {
        const combinedFreshUserData = {
          ...updatedUser,
          ...freshProfile,
          companies: freshProfile.companies || [],
          currentCompanyId: freshProfile.current_company_id,
          currency: freshProfile.currency,
          account_type: freshProfile.account_type,
        }
        setUser(combinedFreshUserData)
      }
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-calendar">
          <div className="loading-calendar-header">Loading Calendar...</div>
          <div className="loading-calendar-grid">
            {Array.from({ length: 25 }, (_, i) => (
              <div key={i} className="loading-date">
                {i + 1}
              </div>
            ))}
          </div>
        </div>
        <p>Loading DayClap...</p>
      </div>
    )
  }

  const isSuperAdmin = user && user.email === 'admin@example.com'

  return (
    <div className="App">
      <Routes>
        <Route
          path="/"
          element={
            user ? (
              isSuperAdmin ? (
                <Navigate to="/superadmin" replace /> // Redirect super admin to dedicated route
              ) : (
                <Dashboard
                  user={user}
                  onLogout={handleLogout}
                  onUserUpdate={handleUserUpdate}
                />
              )
            ) : (
              <LandingPage onAuthSuccess={handleUserUpdate} /> // Pass onAuthSuccess to LandingPage
            )
          }
        />
        <Route
          path="/superadmin"
          element={
            isSuperAdmin ? (
              <SuperAdminDashboard user={user} onLogout={handleLogout} />
            ) : (
              <Navigate to="/" replace /> // Redirect non-super admins away from /superadmin
            )
          }
        />
        {/* The /verified.html path is handled by a static file, no React route needed for it */}
      </Routes>
    </div>
  )
}

export default App
