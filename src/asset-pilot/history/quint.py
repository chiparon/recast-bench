class QuintMark:
    @staticmethod
    def take(numerator, denominator):
        unit = denominator * 5
        whole, tail = divmod(numerator, unit)
        if 2 * tail > unit or (2 * tail == unit and whole % 2):
            whole += 1
        return whole * 5
