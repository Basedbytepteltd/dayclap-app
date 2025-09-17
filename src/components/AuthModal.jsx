import React, { useState, useEffect } from 'react'
import { X, Mail, Lock, User, Building2, Eye, EyeOff, Key } from 'lucide-react' // Import Key icon for OTP
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
  const [showResendButton, setShowResendButton] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // NEW: OTP specific states
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

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
    // Clear resend/OTP messages when input changes
    setResendMessage('');
    setShowResendButton(false);
    setOtpError('');
  }

  // NEW: Handle OTP input change
  const handleOtpChange = (e) => {
    setOtpCode(e.target.value);
    setOtpError('');
  };

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

    if (otpSent) {
      // If OTP was sent, this submission is for OTP verification
      await handleOtpVerification();
      return;
    }

    const newErrors = validateForm()
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setIsLoading(true)
    setErrors({});
    setResendMessage('');
    setShowResendButton(false);
    setOtpError('');

    try {
      let authResponse;
      if (mode === 'login') {
        authResponse = await supabase.auth.signInWithPassword({
          email: formData.email.toLowerCase(),
          password: formData.password,
        });
      } else { // Signup flow
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
        // User is immediately logged in (e.g., email confirmation is off, or already confirmed)
        onAuthSuccess(user);
        onClose();
      } else if (user && !session) {
        // User created, but email confirmation is pending. Now send OTP.
        setResendMessage('Account created! Sending verification code to your email...');
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup_otp',
          email: formData.email.toLowerCase(),
        });

        if (resendError) {
          setErrors({ submit: `Failed to send OTP: ${resendError.message}` });
          setResendMessage('');
          setShowResendButton(true); // Allow resending if initial OTP send fails
        } else {
          setOtpSent(true);
          setResendMessage('A verification code has been sent to your email. Please check your inbox (and spam folder).');
        }
      } else {
        setErrors({ submit: 'An unexpected authentication response occurred.' });
      }
      
    } catch (error) {
      setErrors({ submit: 'An unexpected error occurred during authentication.' });
    } finally {
      setIsLoading(false)
    }
  }

  // NEW: Function to handle OTP verification
  const handleOtpVerification = async () => {
    setOtpLoading(true);
    setOtpError('');
    setResendMessage('');

    if (!otpCode.trim()) {
      setOtpError('OTP code is required.');
      setOtpLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: formData.email.toLowerCase(),
        token: otpCode,
        type: 'email', // Use 'email' type for signup OTP verification
      });

      if (error) {
        setOtpError(`OTP verification failed: ${error.message}`);
        setShowResendButton(true); // Allow resending OTP on failure
        return;
      }

      if (data.user && data.session) {
        onAuthSuccess(data.user);
        onClose();
      } else {
        setOtpError('An unexpected response occurred during OTP verification.');
      }
    } catch (error) {
      setOtpError('An unexpected error occurred during OTP verification.');
    } finally {
      setOtpLoading(false);
    }
  };

  // Function to handle resending verification email (now adapted for OTP)
  const handleResendVerification = async () => {
    setIsLoading(true);
    setResendMessage('');
    setErrors({});
    setOtpError('');
    setShowResendButton(false);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup_otp', // Request a new OTP for signup
        email: formData.email.toLowerCase(),
      });

      if (error) {
        setResendMessage(`Failed to resend verification code: ${error.message}`);
        setShowResendButton(true);
      } else {
        setResendMessage('New verification code sent! Please check your inbox (and spam folder).');
        setOtpSent(true); // Ensure OTP input is shown
      }
    } catch (error) {
      setResendMessage('An unexpected error occurred while trying to resend the code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }
  // Determine if we should show the OTP input form
  const showOtpForm = mode === 'signup' && otpSent;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">
            {showOtpForm ? 'Verify Your Account' : (mode === 'login' ? 'Welcome Back' : 'Create Account')}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X />
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!showOtpForm ? (
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
                    disabled={otpSent} // Disable email input if OTP is sent
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
                      disabled={otpSent} // Disable company input if OTP is sent
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
                    type={showPassword ? 'text' : 'password'} // Toggle type
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className={`form-input ${errors.password ? 'error' : ''}`}
                    placeholder="Enter your password"
                    disabled={otpSent} // Disable password input if OTP is sent
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword(prev => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={otpSent}
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
                      disabled={otpSent} // Disable confirm password input if OTP is sent
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowConfirmPassword(prev => !prev)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      disabled={otpSent}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
                </div>
              )}
            </>
          ) : (
            // NEW: OTP Input Form
            <div className="form-group">
              <label className="form-label">Verification Code</label>
              <div className="input-wrapper">
                <Key className="input-icon" />
                <input
                  type="text"
                  name="otpCode"
                  value={otpCode}
                  onChange={handleOtpChange}
                  className={`form-input ${otpError ? 'error' : ''}`}
                  placeholder="Enter the 6-digit code"
                  maxLength="6"
                  required
                  autoFocus
                  disabled={otpLoading}
                />
              </div>
              {otpError && <span className="error-message">{otpError}</span>}
            </div>
          )}

          {errors.submit && (
            <div className="error-message submit-error">{errors.submit}</div>
          )}

          {resendMessage && (
            <div className={`info-message ${resendMessage.includes('Failed') ? 'error' : 'success'}`} style={{ marginTop: '0.5rem', textAlign: 'center' }}>
              {resendMessage}
            </div>
          )}

          {/* NEW: Resend OTP Button (replaces old resend verification email button) */}
          {showResendButton && formData.email && (
            <button
              type="button"
              className="btn btn-outline btn-full"
              onClick={handleResendVerification}
              disabled={isLoading || otpLoading}
              style={{ marginTop: '1rem' }}
            >
              {isLoading || otpLoading ? 'Sending...' : 'Resend Verification Code'}
            </button>
          )}

          <button 
            type="submit" 
            className="btn btn-primary btn-full"
            disabled={isLoading || otpLoading}
          >
            {showOtpForm ? (otpLoading ? 'Verifying...' : 'Verify Code') : (isLoading ? 'Please wait...' : (mode === 'login' ? 'Sign In' : 'Create Account'))}
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
            disabled={isLoading || otpLoading}
          >
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AuthModal
