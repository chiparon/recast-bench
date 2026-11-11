"""Identifier codec used by the service desk terminal and spool files."""
ALPHABET = "3456789BCDFGHJKM"

def encode_ticket(site, serial):
    site = site.strip().upper()
    digits = ""
    value = serial
    while not digits or value:
        digits = ALPHABET[value % 16] + digits
        value //= 16
    digits = digits.rjust(4, ALPHABET[0])
    check = (sum(ord(c) for c in site) + 7 * serial) % 16
    return site + "/" + digits + "-" + ALPHABET[check]
