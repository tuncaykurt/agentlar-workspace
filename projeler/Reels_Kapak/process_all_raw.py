import os
from image_service import remove_background

def main():
    raw_dir = "ham-[isim]-fotolari"
    out_dir = "outputs/cutouts"
    os.makedirs(out_dir, exist_ok=True)

    if not os.path.exists(raw_dir):
        print(f"Directory {raw_dir} doesn't exist.")
        return

    for filename in os.listdir(raw_dir):
        if filename.lower().endswith(('png', 'jpg', 'jpeg')):
            raw_path = os.path.join(raw_dir, filename)
            out_name = f"cutout_{os.path.splitext(filename)[0]}.png"
            out_path = os.path.join(out_dir, out_name)

            if not os.path.exists(out_path):
                print(f"Processing {filename}...")
                success = remove_background(raw_path, out_path)
                if success:
                    print(f"Successfully processed {filename}")
                else:
                    print(f"Failed to process {filename}")
            else:
                print(f"Skipping {filename}, already processed.")

if __name__ == "__main__":
    main()
