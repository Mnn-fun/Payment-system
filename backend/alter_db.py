import sqlite3

try:
    conn = sqlite3.connect('payment.db')
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN admin_role VARCHAR;")
        print("users Table altered")
    except sqlite3.OperationalError as e:
        print("users error:", e)

    try:
        cursor.execute("ALTER TABLE user_settings ADD COLUMN totp_secret VARCHAR;")
        print("user_settings Table altered")
    except sqlite3.OperationalError as e:
        print("user_settings error:", e)

    try:
        cursor.execute("ALTER TABLE transactions ADD COLUMN user_id INTEGER REFERENCES users(id);")
        cursor.execute("CREATE INDEX ix_transactions_user_id ON transactions (user_id);")
        print("transactions Table altered")
    except sqlite3.OperationalError as e:
        print("transactions error:", e)

    conn.commit()
    conn.close()
except Exception as e:
    print(e)
