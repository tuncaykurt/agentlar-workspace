import logging
import sys

def setup_logger(name: str = "linkedin_paylasim", level=logging.INFO):
    """
    Antigravity V2 Standard Logger.
    - All output goes to stdout (Railway picks it up).
    - Stack traces are never swallowed.
    - print() is banned — use logging.info/error/warning.
    """
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(level)
    return logger
