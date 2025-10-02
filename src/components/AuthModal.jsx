import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User, Eye, EyeOff, Building2, Key } from 'lucide-react'; // Added Key icon for OTP
import { supabase } from '../supabaseClient';
import './AuthModal.css';

const AuthModal = ({ mode, onClose, onSwitchMode, onAuthSuccess }) => {
  // Internal state for form data
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: '',
    otp: '', // NEW: State for OTP input
  });
  const [accountType, setAccountType] = useState('personal');
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  // State for messages and actions related to email verification
  const [infoMessage, setInfoMessage] = useState(''); // General info/success message
  const [infoMessageType, setInfoMessageType] = useState(''); // 'success' or 'error'
  const [showResendVerification, setShowResendVerification] = useState(false); // Show resend button

  // NEW: State to manage the current step in the auth flow
  const [currentAuthStep, setCurrentAuthStep] = useState(mode); // 'login', 'signup', 'verify_otp'

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Effect to reset form/messages when mode changes
  useEffect(() => {
    setFormData({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      companyName: '',
      otp: '', // Reset OTP
    });
    setAccountType('personal');
    setErrors({});
    setInfoMessage('');
    setInfoMessageType('');
    setShowResendVerification(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setCurrentAuthStep(mode); // Reset currentAuthStep based on prop
  }, [mode]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    setInfoMessage(''); // Clear messages on input change
    setInfoMessageType('');
    setShowResendVerification(false);
  };

  const handleAccountTypeChange = (e) => {
    setAccountType(e.target.value);
    if (e.target.value === 'personal') {
      setFormData(prev => ({ ...prev, companyName: '' }));
      setErrors(prev => ({ ...prev, companyName: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (currentAuthStep === 'signup') {
      if (!formData.name.trim()) newErrors.name = 'Name is required';
      if (accountType === 'business' && !formData.companyName.trim()) newErrors.companyName = 'Company name is required for business accounts';
    }
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Email is invalid';
    if (currentAuthStep !== 'verify_otp') { // Password not required for OTP step
      if (!formData.password) newErrors.password = 'Password is required';
      else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
      if (currentAuthStep === 'signup' && formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    }
    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const newErrors = validateForm();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    setErrors({});
    setInfoMessage('');
    setInfoMessageType('');
    setShowResendVerification(false);

    try {
      let authResponse;
      if (currentAuthStep === 'login') {
        authResponse = await supabase.auth.signInWithPassword({
          email: formData.email.toLowerCase(),
          password: formData.password,
        });

        if (authResponse.error) {
          setErrors({ submit: authResponse.error.message });
          setInfoMessageType('error');
          if (authResponse.error.message.includes('Email not confirmed')) {
            setInfoMessage('Your email is not verified. A new verification code has been sent. Please enter it below.');
            setInfoMessageType('info');
            setCurrentAuthStep('verify_otp'); // Switch to OTP verification step
            setShowResendVerification(true);
          } else {
            setInfoMessage(authResponse.error.message);
          }
          return;
        }
        if (authResponse.data.user && authResponse.data.session) {
          onAuthSuccess(authResponse.data.user);
          onClose();
        } else {
          setErrors({ submit: 'An unexpected login response occurred.' });
          setInfoMessage('An unexpected login response occurred.');
          setInfoMessageType('error');
        }

      } else if (currentAuthStep === 'signup') { // Signup flow
        authResponse = await supabase.auth.signUp({
          email: formData.email.toLowerCase(),
          password: formData.password,
          options: {
            data: {
              name: formData.name,
              account_type: accountType,
              company_name_signup: accountType === 'business' ? formData.companyName : null,
            },
            // REMOVED: emailRedirectTo is for link verification, not OTP
          }
        });

        if (authResponse.error) {
          setErrors({ submit: authResponse.error.message });
          setInfoMessage(authResponse.error.message);
          setInfoMessageType('error');
          return;
        }

        const { user, session } = authResponse.data;

        if (user && !session) {
          // User created, but email verification is required (OTP sent)
          setCurrentAuthStep('verify_otp'); // Switch to OTP verification step
          setInfoMessage('Account created! A verification code has been sent to your email. Please enter it below to confirm your account.');
          setInfoMessageType('success');
          setShowResendVerification(true);
        } else if (user && session) {
          // This case might occur if auto-confirm is enabled or if the user was already verified
          onAuthSuccess(user);
          onClose();
        } else {
          setErrors({ submit: 'An unexpected authentication response occurred.' });
          setInfoMessage('An unexpected signup response occurred.');
          setInfoMessageType('error');
        }
      }

    } catch (error) {
      setErrors({ submit: 'An unexpected error occurred during authentication.' });
      setInfoMessage('An unexpected error occurred during authentication.');
      setInfoMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  // NEW: Handle OTP verification
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrors({});
    setInfoMessage('');
    setInfoMessageType('');

    if (!formData.otp.trim()) {
      setErrors({ otp: 'OTP is required' });
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: formData.email.toLowerCase(),
        token: formData.otp,
        type: 'email', // Use 'email' type for signup verification
      });

      if (error) {
        setErrors({ otp: error.message });
        setInfoMessage(error.message);
        setInfoMessageType('error');
        return;
      }

      if (data.user && data.session) {
        setInfoMessage('Email verified successfully! Redirecting...');
        setInfoMessageType('success');
        onAuthSuccess(data.user);
        onClose();
      } else {
        setErrors({ otp: 'An unexpected verification response occurred.' });
        setInfoMessage('An unexpected verification response occurred.');
        setInfoMessageType('error');
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      setErrors({ otp: 'An unexpected error occurred during OTP verification.' });
      setInfoMessage('An unexpected error occurred during OTP verification.');
      setInfoMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setIsLoading(true);
    setInfoMessage('');
    setInfoMessageType('');
    setShowResendVerification(false);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup', // For initial signup verification
        email: formData.email.toLowerCase(),
      });

      if (error) {
        setInfoMessage(`Failed to resend verification code: ${error.message}`);
        setInfoMessageType('error');
        setShowResendVerification(true); // Keep button visible if resend failed
      } else {
        setInfoMessage('New verification code sent! Please check your inbox (and spam folder).');
        setInfoMessageType('success');
      }
    } catch (error) {
      setInfoMessage('An unexpected error occurred while trying to resend the code.');
      setInfoMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">
            {currentAuthStep === 'login' ? 'Welcome Back' : currentAuthStep === 'signup' ? 'Create Account' : 'Verify Email'}
          </h2>
          <button className="modal-close" onClick={onClose}>
            <X />
          </button>
        </div>

        <form className="auth-form" onSubmit={currentAuthStep === 'verify_otp' ? handleVerifyOtp : handleSubmit}>
          {currentAuthStep !== 'verify_otp' && (
            <>
              {currentAuthStep === 'signup' && (
                <>
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
                        required
                      />
                    </div>
                    {errors.name && <span className="error-message">{errors.name}</span>}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Account Type</label>
                    <div className="radio-group">
                      <label>
                        <input
                          type="radio"
                          name="accountType"
                          value="personal"
                          checked={accountType === 'personal'}
                          onChange={handleAccountTypeChange}
                        /> Personal
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="accountType"
                          value="business"
                          checked={accountType === 'business'}
                          onChange={handleAccountTypeChange}
                        /> Business
                      </label>
                    </div>
                  </div>

                  {accountType === 'business' && (
                    <div className="form-group">
                      <label className="form-label">Company Name</label>
                      <div className="input-wrapper">
                        <Building2 className="input-icon" />
                        <input
                          type="text"
                          name="companyName"
                          value={formData.companyName}
                          onChange={handleInputChange}
                          className={`form-input ${errors.companyName ? 'error' : ''}`}
                          placeholder="Enter your company name"
                          required
                        />
                      </div>
                      {errors.companyName && <span className="error-message">{errors.companyName}</span>}
                    </div>
                  )}
                </>
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
                    required
                    disabled={currentAuthStep === 'verify_otp'} // Disable email input during OTP step
                  />
                </div>
                {errors.email && <span className="error-message">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="input-wrapper">
                  <Lock className="input-icon" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className={`form-input ${errors.password ? 'error' : ''}`}
                    placeholder="Enter your password"
                    required
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

              {currentAuthStep === 'signup' && (
                <div className="form-group">
                  <label className="form-label">Confirm Password</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleInputChange}
                      className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                      placeholder="Confirm your password"
                      required
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
          )}

          {currentAuthStep === 'verify_otp' && (
            <div className="form-group">
              <label className="form-label">Verification Code (OTP)</label>
              <div className="input-wrapper">
                <Key className="input-icon" />
                <input
                  type="text"
                  name="otp"
                  value={formData.otp}
                  onChange={handleInputChange}
                  className={`form-input ${errors.otp ? 'error' : ''}`}
                  placeholder="Enter 6-digit code"
                  required
                  maxLength={6}
                />
              </div>
              {errors.otp && <span className="error-message">{errors.otp}</span>}
            </div>
          )}

          {errors.submit && (
            <div className="error-message submit-error">{errors.submit}</div>
          )}

          {infoMessage && (
            <div className={`info-message ${infoMessageType}`} style={{ marginTop: '0.5rem', textAlign: 'center' }}>
              {infoMessage}
            </div>
          )}

          {showResendVerification && formData.email && (
            <button
              type="button"
              className="btn btn-outline btn-full"
              onClick={handleResendVerification}
              disabled={isLoading}
              style={{ marginTop: '1rem' }}
            >
              {isLoading ? 'Sending...' : 'Resend Code'}
            </button>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isLoading}
          >
            {isLoading ? 'Please wait...' : (currentAuthStep === 'login' ? 'Sign In' : currentAuthStep === 'signup' ? 'Create Account' : 'Verify Account')}
          </button>
        </form>

        <div className="auth-switch">
          <span>
            {currentAuthStep === 'login' ? "Don't have an account? " : currentAuthStep === 'signup' ? "Already have an account? " : "Back to login? "}
          </span>
          <button
            type="button"
            className="switch-link"
            onClick={() => {
              if (currentAuthStep === 'verify_otp') {
                setCurrentAuthStep('login'); // Go back to login from OTP
                setFormData(prev => ({ ...prev, otp: '', password: '', confirmPassword: '' })); // Clear OTP and passwords
                setErrors({});
                setInfoMessage('');
                setInfoMessageType('');
                setShowResendVerification(false);
              } else {
                onSwitchMode(currentAuthStep === 'login' ? 'signup' : 'login');
              }
            }}
            disabled={isLoading}
          >
            {currentAuthStep === 'login' ? 'Sign Up' : currentAuthStep === 'signup' ? 'Sign In' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
