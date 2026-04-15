import os
import argparse
import sys
import json
from dotenv import load_dotenv

# Moduler yüklemeler
from collectors import apify_ig, meta_ads
from analyzer import analyze_competitor_data

load_dotenv()

def main():
    parser = argparse.ArgumentParser(description="Antigravity Competitor Radar Engine")
    parser.add_argument("--target", required=True, help="Hedef hesap, sayfa, rakip adı veya arama terimi")
    parser.add_argument("--module", required=True, choices=["apify_ig", "meta_ads"], help="Kullanılacak veri toplama modülü")
    parser.add_argument("--output", default="/tmp/radar_report.md", help="Çıktı analiz raporunun yolu")
    
    args = parser.parse_args()
    
    print(f"🕵️‍♂️ Starting Competitor Radar for: {args.target} using module: {args.module}")
    
    raw_data = None
    
    # 1. Veri Toplama Aşaması (Collection Phase)
    if args.module == "apify_ig":
        print("📥 Running Apify Instagram Collector...")
        raw_data = apify_ig.collect_data(args.target)
    elif args.module == "meta_ads":
        print("📥 Running Meta Ads Collector...")
        raw_data = meta_ads.collect_data(args.target)
    else:
        print(f"❌ Unknown module: {args.module}")
        sys.exit(1)
        
    if not raw_data:
        print("❌ Could not retrieve valid data from the collector.")
        sys.exit(1)
        
    print(f"✅ Data collected successfully. Length of raw chunks: {len(str(raw_data))} characters.")
    
    # 2. Analiz Aşaması (Analysis Phase)
    print("🧠 Sending raw data to Analyzer (LLM)...")
    report_markdown = analyze_competitor_data(args.target, args.module, raw_data)
    
    if report_markdown:
        output_dir = os.path.dirname(args.output)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(report_markdown)
        
        print(f"✅ Competitor Radar Complete. Report saved to: {args.output}")
    else:
        print("❌ Analytics engine failed to generate the report.")
        sys.exit(1)

if __name__ == "__main__":
    main()
