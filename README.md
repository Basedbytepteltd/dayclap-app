# DayClap - Smart Calendar App

A modern full-stack calendar application built with React and Python Flask.

## Features

- **Modern Landing Page**: Clean, responsive design with white/black theme
- **User Authentication**: Secure login and registration system
- **JWT Token Security**: Stateless authentication with JSON Web Tokens
- **Easy Theme Customization**: CSS variables for simple color changes
- **Responsive Design**: Works perfectly on desktop and mobile devices

## Tech Stack

### Frontend
- React 18
- Vite (build tool)
- Lucide React (icons)
- Modern CSS with CSS Variables

### Backend
- Python Flask
- SQLite Database
- JWT Authentication
- Flask-CORS for cross-origin requests

## Quick Start

### Frontend Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Run the setup script (installs dependencies and starts server):
```bash
python run_server.py
```

Or manually:
```bash
pip install -r requirements.txt
python app.py
```

The API will be available at `http://localhost:5000`

## API Endpoints

- `POST /api/signup` - User registration
- `POST /api/login` - User login  
- `GET /api/profile` - Get user profile (requires token)
- `GET /api/health` - Health check

## Color Customization

To change the app's color scheme, edit the CSS variables in `src/index.css`:

```css
:root {
  --primary-bg: #ffffff;     /* Main background */
  --secondary-bg: #f8f9fa;   /* Secondary background */
  --primary-text: #000000;   /* Main text color */
  --secondary-text: #6c757d; /* Secondary text */
  --accent-color: #000000;   /* Accent/brand color */
  --button-bg: #000000;      /* Button background */
  --button-text: #ffffff;    /* Button text */
  /* ... more variables */
}
```

## Project Structure

```
dayclap/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── LandingPage.jsx
│   │   │   ├── AuthModal.jsx
│   │   │   └── *.css
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── index.html
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── run_server.py
└── README.md
```

## Next Steps

After getting the basic app running, you can extend it with:

- Calendar views (month, week, day)
- Event creation and management
- User dashboard
- Event sharing and collaboration
- Mobile app support
- Advanced scheduling features

## Development Notes

- The backend uses SQLite for development (automatically created)
- JWT tokens expire after 7 days
- CORS is enabled for frontend-backend communication
- The app uses modern ES6+ JavaScript features
- Responsive design supports mobile devices

## Production Deployment

For production deployment, make sure to:

1. Change the Flask `SECRET_KEY` 
2. Use a production database (PostgreSQL, MySQL)
3. Set up proper environment variables
4. Configure HTTPS
5. Use a production WSGI server (Gunicorn, uWSGI)
6. Set up proper logging and error handling
