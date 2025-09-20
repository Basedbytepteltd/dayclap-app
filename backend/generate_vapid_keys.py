from py_vapid import Vapid
from cryptography.hazmat.primitives import serialization
import base64
import json

def generate_and_print_vapid_keys():
    vapid_instance = Vapid()
    vapid_instance.generate_keys() # This generates the private and public key objects

    # Extract public key in uncompressed point format
    public_key_bytes = vapid_instance.public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )
    # URL-safe Base64 encode and then decode to string
    public_key_b64url = base64.urlsafe_b64encode(public_key_bytes).rstrip(b'=').decode('utf-8')

    # Extract private key's raw integer value and convert to 32-byte big-endian
    # This is the correct way to get the raw 32-byte private key for VAPID
    private_key_bytes = vapid_instance.private_key.private_numbers().private_value.to_bytes(32, 'big')
    
    # URL-safe Base64 encode and then decode to string
    private_key_b64url = base64.urlsafe_b64encode(private_key_bytes).rstrip(b'=').decode('utf-8')
    
    print('\n--- VAPID Keys Generated ---')
    print(f'VAPID Public Key: {public_key_b64url}')
    print(f'VAPID Private Key: {private_key_b64url}')
    print('----------------------------')
    print('\nIMPORTANT: Update your .env files with these keys.')
    print('  - VITE_VAPID_PUBLIC_KEY in frontend/.env')
    print('  - VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in backend/.env')

if __name__ == '__main__':
    generate_and_print_vapid_keys()
