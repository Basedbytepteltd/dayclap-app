import os
from webpush import generate_vapid_keys

def generate_keys():
    private_key, public_key = generate_vapid_keys()
    print("Generated VAPID Keys:")
    print(f"VAPID_PUBLIC_KEY=\"{public_key}\"")
    print(f"VAPID_PRIVATE_KEY=\"{private_key}\"")
    print("\nIMPORTANT: Update your .env and backend/.env files with these keys.")

if __name__ == "__main__":
    generate_keys()
