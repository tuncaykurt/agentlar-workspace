import argparse
import sys
import os
import random
import shutil
from datetime import datetime
from fpdf import FPDF
from fpdf.enums import XPos, YPos

class TaxInvoicePDF(FPDF):
    pass

def generate_invoice(brand_name, company_name, company_email, company_address, amount, currency, output_dir, description_override=None, qty=1, unit_cost=None):
    today = datetime.now()
    issue_date = today.strftime('%d/%m/%Y')
    invoice_number = f"INV-{today.strftime('%Y%m%d')}-{random.randint(100, 999)}"
    
    safe_brand = "".join([c if c.isalnum() else "_" for c in brand_name])
    filename = f"INVOICE_{safe_brand}_{today.strftime('%d-%m-%Y')}.pdf"
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    output_path = os.path.join(output_dir, filename)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    try:
        pdf = TaxInvoicePDF()
        pdf.add_font("Roboto", "", os.path.join(script_dir, "Roboto-Regular.ttf"))
        pdf.add_font("Roboto", "B", os.path.join(script_dir, "Roboto-Bold.ttf"))
        
        pdf.add_page()
        pdf.set_auto_page_break(auto=True, margin=15)
        
        pdf.set_font("Roboto", "B", 14)
        pdf.cell(0, 10, "TAX INVOICE", border=1, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        col1_w = 120
        col2_w = 70
        
        pdf.set_font("Roboto", "B", 10)
        # Row 1
        pdf.cell(col1_w, 8, "Vendor Name: [İSİM SOYAD]", border="LTR", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col2_w, 8, f"Invoice No: {invoice_number}", border="LTR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        # Row 2
        pdf.set_font("Roboto", "", 10)
        pdf.cell(col1_w, 8, "Address: Mithatpaşa Cad. No: 103/3, Balçova, İzmir", border="LR", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col2_w, 8, f"Invoice Date: {issue_date}", border="LR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        # Row spacer
        pdf.cell(col1_w, 6, "", border="LR", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col2_w, 6, "", border="LR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        # Row 3
        pdf.cell(col1_w, 8, "TIN: N/A (W8BEN on file)", border="LR", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col2_w, 8, "", border="LR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        # Row 4
        pdf.cell(col1_w, 8, "Email ID: EMAIL_ADRESI_BURAYA", border="LR", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col2_w, 8, "", border="LR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        # Row 5
        pdf.cell(col1_w, 8, "Mobile Number: +90 533 366 62 13", border="LR", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col2_w, 8, "", border="LR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        # Spacer
        pdf.cell(col1_w, 4, "", border="LR", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col2_w, 4, "", border="LR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        # Bill To section
        pdf.set_font("Roboto", "B", 10)
        pdf.cell(col1_w, 8, "Bill To:", border="LR", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col2_w, 8, "", border="LR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        pdf.set_font("Roboto", "", 10)
        pdf.cell(col1_w, 8, f"{company_name}", border="LR", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col2_w, 8, "", border="LR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        clean_address = company_address.replace("\\n", " ").replace("\n", " ").strip()
        
        address_parts = [clean_address[i:i+80] for i in range(0, len(clean_address), 80)]
        for part in address_parts:
            pdf.cell(col1_w, 8, part, border="LR", new_x=XPos.RIGHT, new_y=YPos.TOP)
            pdf.cell(col2_w, 8, "", border="LR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            
        pdf.cell(col1_w, 8, "", border="LBR", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(col2_w, 8, "", border="LBR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        pdf.ln(5)

        # Table Headers
        pdf.set_font("Roboto", "B", 10)
        w_sno = 15
        w_desc = 95
        w_qty = 20
        w_rate = 30
        w_amt = 30
        
        pdf.cell(w_sno, 10, "S.No", border=1, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(w_desc, 10, "Description of Services", border=1, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(w_qty, 10, "Quantity", border=1, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(w_rate, 10, f"Rate ({currency})", border=1, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(w_amt, 10, f"Amount ({currency})", border=1, align="C", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        # Table Row
        pdf.set_font("Roboto", "", 10)
        description = description_override if description_override else f"Collaboration with @INSTAGRAM_KULLANICI_ADI"
        display_unit = str(unit_cost) if unit_cost is not None else str(amount)
        display_qty = str(qty)
        display_total = str(amount)
        
        pdf.cell(w_sno, 10, "1", border=1, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(w_desc, 10, description, border=1, align="L", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(w_qty, 10, display_qty, border=1, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(w_rate, 10, f"{float(display_unit):.2f}", border=1, align="R", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(w_amt, 10, f"{float(display_total):.2f}", border=1, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        # Blank row
        for _ in range(1):
            pdf.cell(w_sno, 10, "", border=1, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)
            pdf.cell(w_desc, 10, "", border=1, align="L", new_x=XPos.RIGHT, new_y=YPos.TOP)
            pdf.cell(w_qty, 10, "", border=1, align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)
            pdf.cell(w_rate, 10, "", border=1, align="R", new_x=XPos.RIGHT, new_y=YPos.TOP)
            pdf.cell(w_amt, 10, "", border=1, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
            
        # Total Row
        pdf.set_font("Roboto", "B", 10)
        pdf.cell(w_sno + w_desc + w_qty, 10, "", border="T", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(w_rate, 10, f"Total ({currency}):", border=1, align="R", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.cell(w_amt, 10, f"{float(display_total):.2f}", border=1, align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        pdf.ln(5)
        
        # Payment Details
        pdf.set_font("Roboto", "B", 10)
        payment_width = w_sno + w_desc + w_qty + w_rate + w_amt
        pdf.cell(payment_width, 8, "Payment Details:", border="LTR", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        pdf.set_font("Roboto", "", 10)
        
        def payment_row(label, value, is_last=False):
            b_left = "L"
            b_right = "R"
            if is_last:
                b_left = "LB"
                b_right = "RB"
            pdf.cell(50, 8, f"{label}", border=b_left, align="L", new_x=XPos.RIGHT, new_y=YPos.TOP)
            pdf.cell(payment_width - 50, 8, f"{value}", border=b_right, align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        payment_row("Bank Name", "First Century Bank")
        payment_row("Bank Address", "1731 N Elm St Commerce, GA 30529 USA")
        payment_row("Account Type", "CHECKING")
        payment_row("Account Number", "4020503005274")
        payment_row("SWIFT CODE", "FCNSUS32")
        payment_row("IBAN", "")
        payment_row("Routing Number", "061120084")
        payment_row("Beneficiary Name", "[İSİM SOYAD]")
        
        # Last row has terms on left and auth signatory on right
        pdf.set_font("Roboto", "B", 10)
        pdf.cell(100, 15, "Payment Terms: ", border="LB", align="L", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.set_font("Roboto", "", 10)
        pdf.cell(payment_width - 100, 15, "Authorised Signatory (Name & Sign)      ", border="RB", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        
        pdf.output(output_path)
        
        downloads_dir = os.path.expanduser("~/Downloads")
        downloads_path = os.path.join(downloads_dir, filename)
        try:
            shutil.copy2(output_path, downloads_path)
            print(f"COPY: Also saved to {downloads_path}")
        except:
            pass
        
        print(f"SUCCESS: Invoice generated at {output_path}")
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"FAILED to generate invoice PDF: {e}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate an invoice PDF.")
    parser.add_argument("--brand", required=True, help="Brand name for the description")
    parser.add_argument("--company", required=True, help="Company legal name")
    parser.add_argument("--email", default="", help="Company email")
    parser.add_argument("--address", default="", help="Company address")
    parser.add_argument("--amount", required=True, help="Amount (e.g. 600)")
    parser.add_argument("--currency", default="$", help="Currency symbol (e.g. $ or TL)")
    parser.add_argument("--description", default="", help="Custom description for the invoice line item")
    parser.add_argument("--qty", type=int, default=1, help="Quantity of items (e.g. 3)")
    parser.add_argument("--unit-cost", default="", help="Per-unit cost (e.g. 500). If not given, amount is used.")
    parser.add_argument("--output", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "uretilen-faturalar"), help="Output directory")
    
    args = parser.parse_args()
    
    generate_invoice(
        args.brand,
        args.company,
        args.email,
        args.address,
        args.amount,
        args.currency,
        os.path.abspath(args.output),
        args.description or None,
        qty=args.qty,
        unit_cost=args.unit_cost or None
    )
