class FolioMark:
    @staticmethod
    def label(owner, ticket):
        left = owner.strip().lower()
        right = ticket.strip()
        return "F2/" + str(len(left)) + "/" + left + "/" + right.replace("~", "~~").replace("/", "~s")
