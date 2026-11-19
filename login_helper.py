#!/usr/bin/env python3
"""
Telegram Login Helper — Pyrogram based
Called by Node.js bot via subprocess for real phone/OTP/2FA login.

Usage:
  python3 login_helper.py send_code <phone_number>
  python3 login_helper.py sign_in <phone_number> <otp_code>
  python3 login_helper.py sign_in_2fa <phone_number> <password>
  python3 login_helper.py get_session <phone_number>
  python3 login_helper.py logout <phone_number>
"""

import sys
import json
import os
import subprocess
import asyncio


def ensure_pyrogram():
    """Ensure pyrogram is importable, installing if needed."""
    try:
        from pyrogram import Client  # noqa: F401
        from pyrogram.errors import SessionPasswordNeeded  # noqa: F401
        return True
    except ImportError:
        pass

    # Try installing pyrogram for this Python interpreter
    for pip_cmd in [
        [sys.executable, '-m', 'pip', 'install', 'pyrogram'],
        ['pip3', 'install', 'pyrogram'],
        ['pip', 'install', 'pyrogram'],
    ]:
        try:
            subprocess.check_call(pip_cmd, timeout=120)
            # Verify import works now
            from pyrogram import Client  # noqa: F401
            from pyrogram.errors import SessionPasswordNeeded  # noqa: F401
            return True
        except Exception:
            continue

    return False


SESSIONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sessions')
os.makedirs(SESSIONS_DIR, exist_ok=True)

API_ID = os.environ.get('LOGIN_API_ID', '')
API_HASH = os.environ.get('LOGIN_API_HASH', '')


def session_name(phone):
    return os.path.join(SESSIONS_DIR, phone.replace('+', '').replace(' ', ''))


async def send_code(phone):
    """Send OTP code to phone number."""
    if not API_ID or not API_HASH:
        print(json.dumps({'error': 'LOGIN_API_ID or LOGIN_API_HASH not set'}))
        return

    if not ensure_pyrogram():
        print(json.dumps({'error': 'PYROGRAM_NOT_INSTALLED', 'message': 'Failed to install pyrogram. Check server logs.'}))
        return

    from pyrogram import Client
    from pyrogram.errors import SessionPasswordNeeded, PhoneCodeInvalid, PhoneCodeExpired

    client = Client(session_name(phone), api_id=int(API_ID), api_hash=API_HASH)
    await client.connect()
    try:
        sent = await client.send_code(phone)
        print(json.dumps({
            'success': True,
            'phone_code_hash': sent.phone_code_hash,
            'type': sent.type.__class__.__name__ if sent.type else 'unknown'
        }))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
    finally:
        await client.disconnect()


async def sign_in(phone, otp_code):
    """Sign in with OTP code."""
    if not API_ID or not API_HASH:
        print(json.dumps({'error': 'LOGIN_API_ID or LOGIN_API_HASH not set'}))
        return

    if not ensure_pyrogram():
        print(json.dumps({'error': 'PYROGRAM_NOT_INSTALLED', 'message': 'Failed to install pyrogram. Check server logs.'}))
        return

    from pyrogram import Client
    from pyrogram.errors import SessionPasswordNeeded, PhoneCodeInvalid, PhoneCodeExpired

    hash_file = session_name(phone) + '.hash'
    phone_code_hash = ''
    if os.path.exists(hash_file):
        with open(hash_file, 'r') as f:
            phone_code_hash = f.read().strip()

    client = Client(session_name(phone), api_id=int(API_ID), api_hash=API_HASH)
    await client.connect()
    try:
        await client.sign_in(phone, phone_code_hash, otp_code)
        session_string = await client.export_session_string()
        with open(session_name(phone) + '.session_string', 'w') as f:
            f.write(session_string)
        print(json.dumps({'success': True, 'session_string': session_string[:20] + '...'}))
    except SessionPasswordNeeded:
        print(json.dumps({'error': '2FA_PASSWORD_NEEDED', 'message': 'Two-step verification password required'}))
    except PhoneCodeInvalid:
        print(json.dumps({'error': 'INVALID_OTP', 'message': 'Invalid OTP code'}))
    except PhoneCodeExpired:
        print(json.dumps({'error': 'OTP_EXPIRED', 'message': 'OTP code expired'}))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
    finally:
        await client.disconnect()


async def sign_in_2fa(phone, password):
    """Sign in with 2FA password."""
    if not API_ID or not API_HASH:
        print(json.dumps({'error': 'LOGIN_API_ID or LOGIN_API_HASH not set'}))
        return

    if not ensure_pyrogram():
        print(json.dumps({'error': 'PYROGRAM_NOT_INSTALLED', 'message': 'Failed to install pyrogram. Check server logs.'}))
        return

    from pyrogram import Client

    client = Client(session_name(phone), api_id=int(API_ID), api_hash=API_HASH)
    await client.connect()
    try:
        await client.check_password(password)
        session_string = await client.export_session_string()
        with open(session_name(phone) + '.session_string', 'w') as f:
            f.write(session_string)
        print(json.dumps({'success': True, 'session_string': session_string[:20] + '...'}))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
    finally:
        await client.disconnect()


async def get_session(phone):
    """Get saved session string."""
    ss_file = session_name(phone) + '.session_string'
    if os.path.exists(ss_file):
        with open(ss_file, 'r') as f:
            session_string = f.read().strip()
        print(json.dumps({'success': True, 'session_string': session_string}))
    else:
        print(json.dumps({'error': 'NO_SESSION', 'message': 'No saved session found'}))


async def logout(phone):
    """Clear saved session."""
    for ext in ['', '.session_string', '.hash']:
        f = session_name(phone) + ext
        if os.path.exists(f):
            os.remove(f)
    print(json.dumps({'success': True, 'message': 'Session cleared'}))


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No command provided'}))
        return

    command = sys.argv[1]

    if command == 'send_code' and len(sys.argv) >= 3:
        await send_code(sys.argv[2])
    elif command == 'sign_in' and len(sys.argv) >= 4:
        await sign_in(sys.argv[2], sys.argv[3])
    elif command == 'sign_in_2fa' and len(sys.argv) >= 4:
        await sign_in_2fa(sys.argv[2], sys.argv[3])
    elif command == 'get_session' and len(sys.argv) >= 3:
        await get_session(sys.argv[2])
    elif command == 'logout' and len(sys.argv) >= 3:
        await logout(sys.argv[2])
    else:
        print(json.dumps({'error': 'Invalid command or missing arguments'}))


if __name__ == '__main__':
    asyncio.run(main())