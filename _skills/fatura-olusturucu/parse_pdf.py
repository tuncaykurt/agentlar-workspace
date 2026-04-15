import pypdf
import sys

try:
    with open("./_skills/fatura-olusturucu/uretilen-faturalar/INVOICE_Emergent_Labs_30-03-2026.pdf", "rb") as f:
        r = pypdf.PdfReader(f)
        text = r.pages[0].extract_text()
        print(text)
except Exception as e:
    print(f"Error: {e}", file=sys.stderr)
