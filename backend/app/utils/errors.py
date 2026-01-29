class BusinessError(Exception):
    pass


class InsufficientBalanceError(BusinessError):
    pass


class InvalidTransactionError(BusinessError):
    pass
