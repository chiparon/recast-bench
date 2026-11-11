"""Wire record used by the warehouse manifest exporter."""
def encode_manifest(code, qty):
    text = code.replace("%", "%25").replace("|", "%7C").replace("\n", "%0A")
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    field = ""
    while not field or qty:
        field = digits[qty % 36] + field
        qty //= 36
    return field.rjust(3, "0") + "|" + text
