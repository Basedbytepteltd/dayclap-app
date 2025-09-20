import subprocess
import sys
import os

def install_requirements():
    """Install required packages"""
    print("Installing Python dependencies...")
    try:
        # Ensure requirements.txt is found relative to this script
        requirements_path = os.path.join(os.path.dirname(__file__), 'requirements.txt')
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', requirements_path])
        print("Dependencies installed successfully!")
        return True
    except subprocess.CalledProcessError as e:
        print(f"Failed to install dependencies: {e}")
        return False

def run_server():
    """Run the Flask server"""
    # Change current working directory to the backend directory
    backend_dir = os.path.dirname(__file__)
    os.chdir(backend_dir)
    
    try:
        print("Starting DayClap API server...")
        print("Server will be available at: http://localhost:5000")
        print("Press Ctrl+C to stop the server")
        # Now 'app.py' is relative to the new CWD
        subprocess.run([sys.executable, 'app.py'])
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"Error running server: {e}")

if __name__ == '__main__':
    # Check for requirements.txt in the same directory as run_server.py
    requirements_path = os.path.join(os.path.dirname(__file__), 'requirements.txt')
    if not os.path.exists(requirements_path):
        print(f"Error: requirements.txt not found at {requirements_path}!")
        sys.exit(1)
    
    if install_requirements():
        run_server()
    else:
        print("Failed to start server due to dependency issues")
        sys.exit(1)