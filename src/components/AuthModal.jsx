import React, { useState, useEffect } from 'react'
import { X, Mail, Lock, User, Eye, EyeOff } from 'lucide-react' // Removed Building2 icon
import { supabase } from '../supabaseClient'
import './AuthModal.css'

const AuthModal = ({ mode, onClose, onSwitchMode, onAuthSuccess }) => {
  // Debug log for AuthModal mounting
  useEffect(() => {
    console.log('AuthModal: Component mounted/rendered with mode:', mode);
    return () => {
      console.log('AuthModal: Component unmounted.');
    };
  }, [mode]);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    // Removed company: ''
  })
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [showResendButton, setShowResendButton] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
    // Clear resend messages when input changes
    setResendMessage('');
    setShowResendButton(false);
  }

  const validateForm = () => {
    const newErrors = {}

    if (mode === 'signup' && !formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    if (mode === 'signup' && formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    return newErrors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    console.log('AuthModal: handleSubmit called. Current mode:', mode);

    const newErrors = validateForm()
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsLoading(true)
    setErrors({});
    setResendMessage('');
    setShowResendButton(false);

    try {
      let authResponse;
      if (mode === 'login') {
        // Standard password login
        authResponse = await supabase.auth.signInWithPassword({
          email: formData.email.toLowerCase(),
          password: formData.password,
        });

        if (authResponse.error) {
          setErrors({ submit: authResponse.error.message });
          console.error('AuthModal: Login error:', authResponse.error.message);
          return;
        }
        if (authResponse.data.user && authResponse.data.session) {
          onAuthSuccess(authResponse.data.user);
          onClose();
          console.log('AuthModal: Login successful.');
        } else {
          setErrors({ submit: 'An unexpected login response occurred.' });
          console.error('AuthModal: Unexpected login response.');
        }

      } else { // Signup flow (now with email verification link)
        authResponse = await supabase.auth.signUp({
          email: formData.email.toLowerCase(),
          password: formData.password,
          options: {
            data: {
              name: formData.name,
              // Removed company: formData.company
            },
            emailRedirectTo: window.location.origin + '/verified', // Use email link confirmation
          }
        });

        if (authResponse.error) {
          setErrors({ submit: authResponse.error.message });
          console.error('AuthModal: Signup error:', authResponse.error.message);
          // If the error is related to email not confirmed, show resend button
          if (authResponse.error.message.includes('Email not confirmed') || authResponse.error.message.includes('Email link is invalid or has expired')) {
            setShowResendButton(true);
          }
          return;
        }

        const { user, session } = authResponse.data;

        if (user && session) {
          // User is immediately logged in (e.g., email confirmation is off, or already confirmed)
          onAuthSuccess(user);
          onClose();
          console.log('AuthModal: Signup successful, user immediately logged in.');
        } else if (user && !session) {
          // User created, but email confirmation is pending. Prompt for email link.
          setResendMessage('Account created! A verification link has been sent to your email. Please check your inbox (and spam folder) to confirm your account.');
          setShowResendButton(true); // Allow resending if user doesn't receive it
          console.log('AuthModal: Signup successful, verification link sent.');
        } else {
          setErrors({ submit: 'An unexpected authentication response occurred.' });
          console.error('AuthModal: Unexpected signup response.');
        }
      }
      
    } catch (error) {
      setErrors({ submit: 'An unexpected error occurred during authentication.' });
      console.error('AuthModal: General authentication error:', error);
    } finally {
      setIsLoading(false)
    }
  }

  // Function to handle resending verification link (using supabase.auth.resend for signup type)
  const handleResendVerification = async () => {
    console.log('AuthModal: handleResendVerification called.');
    setIsLoading(true);
    setResendMessage('');
    setErrors({});
    setShowResendButton(false);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup', // Use 'signup' to re-send the signup confirmation email link
        email: formData.email.toLowerCase(),
      });

      if (error) {
        setResendMessage(`Failed to resend verification link: ${error.message}`);
        setShowResendButton(true);
        console.error('AuthModal: Resend verification error:', error.message);
      } else {
        setResendMessage('New verification link sent! Please check your inbox (and spam folder).');
        console.log('AuthModal: Resend verification successful.');
      }
    } catch (error) {
      setResendMessage('An unexpected error occurred while trying to resend the link.');
      console.error('AuthModal: General resend verification error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      console.log('AuthModal: Backdrop clicked, closing modal.');
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X />
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <>
            {mode === 'signup' && (
              <div className="form-group">
                <label className="form-label">Name</label>
                <div className="input-wrapper">
                  <User className="input-icon" />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className={`form-input ${errors.name ? 'error' : ''}`}
                    placeholder="Enter your name"
                  />
                </div>
                {errors.name && <span className="error-message">{errors.name}</span>}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email</label>
              <div className="input-wrapper">
                <Mail className="input-icon" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className={`form-input ${errors.email ? 'error' : ''}`}
                  placeholder="Enter your email"
                />
              </div>
              {errors.email && <span className="error-message">{errors.email}</span>}
            </div>

            {/* Removed Company input field */}

            <div className="form-group">
              <label className="form-label">Password</label>
              <div className="input-wrapper">
                <Lock className="input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'} // Toggle type
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className={`form-input ${errors.password ? 'error' : ''}`}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(prev => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <span className="error-message">{errors.password}</span>}
            </div>

            {mode === 'signup' && (
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <div className="input-wrapper">
                  <Lock className="input-icon" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'} // Toggle type
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                    placeholder="Confirm your password"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowConfirmPassword(prev => !prev)}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
              </div>
            )}
          </>

          {errors.submit && (
            <div className="error-message submit-error">{errors.submit}</div>
          )}

          {resendMessage && (
            <div className={`info-message ${resendMessage.includes('Failed') ? 'error' : 'success'}`} style={{ marginTop: '0.5rem', textAlign: 'center' }}>
              {resendMessage}
            </div>
          )}

          {/* Resend Verification Link Button */}
          {showResendButton && formData.email && (
            <button
              type="button"
              className="btn btn-outline btn-full"
              onClick={handleResendVerification}
              disabled={isLoading}
              style={{ marginTop: '1rem' }}
            >
              {isLoading ? 'Sending...' : 'Resend Verification Link'}
            </button>
          )}

          <button 
            type="submit" 
            className="btn btn-primary btn-full"
            disabled={isLoading}
          >
            {isLoading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="auth-switch">
          <span>
            {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          </span>
          <button 
            type="button"
            className="switch-link"
            onClick={() => onSwitchMode(mode === 'login' ? 'signup' : 'login')}
            disabled={isLoading}
          >
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AuthModal
