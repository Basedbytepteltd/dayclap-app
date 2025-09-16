import React, { useState, useEffect } from 'react'
import { X, Mail, Lock, User, Building2 } from 'lucide-react'
import { supabase } from '../supabaseClient'
import './AuthModal.css'

const AuthModal = ({ mode, onClose, onSwitchMode, onAuthSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    company: ''
  })
  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [showResendButton, setShowResendButton] = useState(false); // NEW: State to control resend button visibility
  const [resendMessage, setResendMessage] = useState(''); // NEW: State for resend feedback

  // Removed localStorage.removeItem calls to prevent interference with Supabase session persistence.
  // useEffect(() => {
  //   localStorage.removeItem('dayclap_users');
  //   localStorage.removeItem('dayclap_current_user');
  // }, []);

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
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) { // Corrected regex
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

    const newErrors = validateForm()
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsLoading(true)
    setErrors({});
    setResendMessage(''); // Clear previous resend messages
    setShowResendButton(false); // Reset resend button visibility

    try {
      let authResponse;
      if (mode === 'login') {
        authResponse = await supabase.auth.signInWithPassword({
          email: formData.email.toLowerCase(),
          password: formData.password,
        });
      } else {
        authResponse = await supabase.auth.signUp({
          email: formData.email.toLowerCase(),
          password: formData.password,
          options: {
            data: {
              name: formData.name,
              company: formData.company
            }
          }
        });
      }

      if (authResponse.error) {
        setErrors({ submit: authResponse.error.message });
        // If the error is related to email not confirmed, show resend button
        if (authResponse.error.message.includes('Email not confirmed') || authResponse.error.message.includes('Email link is invalid or has expired')) {
          setShowResendButton(true);
        }
        return;
      }

      const { user, session } = authResponse.data;

      if (user && session) {
        onAuthSuccess(user);
        onClose();
      } else if (authResponse.data.user && !authResponse.data.session) {
        setErrors({ submit: 'Please check your email to confirm your account before logging in.' });
        setShowResendButton(true); // Show resend button after signup if confirmation is needed
      } else {
        setErrors({ submit: 'An unexpected authentication response occurred.' });
      }
      
    } catch (error) {
      setErrors({ submit: 'An unexpected error occurred during authentication.' });
    } finally {
      setIsLoading(false)
    }
  }

  // NEW: Function to handle resending verification email
  const handleResendVerification = async () => {
    setIsLoading(true);
    setResendMessage('');
    setErrors({});

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: formData.email.toLowerCase(),
      });

      if (error) {
        setResendMessage(`Failed to resend verification email: ${error.message}`);
      } else {
        setResendMessage('Verification email sent! Please check your inbox (and spam folder).');
        setShowResendButton(false); // Hide button after successful resend
      }
    } catch (error) {
      setResendMessage('An unexpected error occurred while trying to resend the email.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
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

          {mode === 'signup' && (
            <div className="form-group">
              <label className="form-label">Company <span className="optional-text">(Optional)</span></label>
              <div className="input-wrapper">
                <Building2 className="input-icon" />
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleInputChange}
                  className={`form-input ${errors.company ? 'error' : ''}`}
                  placeholder="Enter your company name"
                />
              </div>
              {errors.company && <span className="error-message">{errors.company}</span>}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className={`form-input ${errors.password ? 'error' : ''}`}
                placeholder="Enter your password"
              />
            </div>
            {errors.password && <span className="error-message">{errors.password}</span>}
          </div>

          {mode === 'signup' && (
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <div className="input-wrapper">
                <Lock className="input-icon" />
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                  placeholder="Confirm your password"
                />
              </div>
              {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
            </div>
          )}

          {errors.submit && (
            <div className="error-message submit-error">{errors.submit}</div>
          )}

          {/* NEW: Resend Verification Email Button */}
          {showResendButton && formData.email && (
            <button
              type="button"
              className="btn btn-outline btn-full"
              onClick={handleResendVerification}
              disabled={isLoading}
              style={{ marginTop: '1rem' }}
            >
              {isLoading ? 'Sending...' : 'Resend Verification Email'}
            </button>
          )}
          {resendMessage && (
            <div className={`info-message ${resendMessage.includes('Failed') ? 'error' : 'success'}`} style={{ marginTop: '0.5rem', textAlign: 'center' }}>
              {resendMessage}
            </div>
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
          >
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AuthModal
