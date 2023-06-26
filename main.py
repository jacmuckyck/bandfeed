import imaplib
import email
from email.header import decode_header
import mysql.connector
import re
import os

mydb = mysql.connector.connect(
    host=os.environ["DB_HOST"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    database=os.environ["DB_DATABASE"],
)

imap_server = "imap.gmail.com"  # IMAP server and account credentials
myEmail = os.environ["myEmail"]
myPass = os.environ["myPass"]

try:
    imap = imaplib.IMAP4_SSL(imap_server)
    imap.login(myEmail, myPass)
    print(f"Logged into {myEmail}")

    imap.select("Music")

    _, data = imap.search(None, "ALL")

    email_ids = data[0].split()

    total_messages = len(email_ids)

    cursor = mydb.cursor()
    cursor.execute("SELECT body FROM main")
    existing_urls = [row[0] for row in cursor.fetchall()]
    cursor.execute("SELECT subject FROM main")
    existing_subjects = [row[0] for row in cursor.fetchall()]
    cursor.execute("SELECT body FROM archive")
    existing_link = [row[0] for row in cursor.fetchall()]
    cursor.close()

    for message_number in range(1, total_messages + 1):
        print(f"Processing email {message_number}/{total_messages}")

        _, message_data = imap.fetch(email_ids[message_number-1], "(BODY[])")
        message = message_data[0][1]
        email_message = email.message_from_bytes(message)
        sender = decode_header(email_message["From"])[0][0]
        if isinstance(sender, bytes):
            try:
                sender = sender.decode(errors="ignore")
            except UnicodeDecodeError:
                sender = str(sender)
        subject = decode_header(email_message["Subject"])[0][0]
        if isinstance(subject, bytes):
            try:
                subject = subject.decode(errors="ignore")
            except UnicodeDecodeError:
                subject = str(subject)

        bad_subject1 = re.findall(r"Download Now:", subject)
        bad_subject2 = re.findall(r"Weekly Digest:", subject)

        if bad_subject1 or bad_subject2:
            continue

        date = email_message["Date"]
        parsed_date = email.utils.parsedate_to_datetime(date)
        formatted_date = parsed_date.strftime("%Y-%m-%d")

        current_email = {
            "From": sender,
            "Subject": subject,
            "Date": formatted_date,
            "Body": "",
        }

        for part in email_message.walk():
            if part.get_content_type() == "text/plain":
                try:
                    body_text = part.get_payload(decode=True).decode(errors="ignore")
                    bodyURL = re.findall("https?:\/\/[^\s]+", body_text)[0]
                except UnicodeDecodeError:
                    error_info = {
                        "Subject": current_email["Subject"],
                        "Date": current_email["Date"],
                    }
                    break

                current_email["Body"] = bodyURL

                if bodyURL in existing_urls:
                    print(f"Skipping duplicate email with URL: {bodyURL}")
                    break
        else:
            command2 = "INSERT INTO main (sender, subject, body, date) VALUES (%s, %s, %s, %s)"
            values2 = (
                current_email["From"],
                current_email["Subject"],
                current_email["Body"],
                formatted_date,
            )

            cursor = mydb.cursor()
            cursor.execute(command2, values2)
            mydb.commit()
            cursor.close()

        # Delete the processed email
        imap.store(email_ids[message_number-1], "+FLAGS", "\\Deleted")

    # Expunge the deleted emails from the mailbox
    imap.expunge()

    imap.close()
    imap.logout()

    if total_messages != 0:
        print("Emails downloaded successfully.")
    else:
        print("No new emails")

except imaplib.IMAP4.error:
    print(f"Failed to login or retrieve emails.")

