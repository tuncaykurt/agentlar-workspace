import os
from rembg import remove
from PIL import Image

def remove_background(input_path: str, output_path: str):
    """
    Removes the background from the given image and saves it as a PNG with alpha channel.
    """
    print(f"Loading image from {input_path}...")
    try:
        input_image = Image.open(input_path)
    except Exception as e:
        print(f"Error loading image: {e}")
        return False
    
    print("Removing background... This may take a moment.")
    try:
        # Generate the image without background
        output_image = remove(input_image)
    except Exception as e:
        print(f"Error during background removal: {e}")
        return False
        
    print(f"Saving background-free image to {output_path}...")
    try:
        output_image.save(output_path, "PNG")
        print("Done!")
        return True
    except Exception as e:
        print(f"Error saving image: {e}")
        return False

if __name__ == "__main__":
    # Test on a sample photo
    test_input = "ham-[isim]-fotolari/IMG_4188.jpg"
    test_output = "outputs/IMG_4188_nobg.png"
    
    os.makedirs("outputs", exist_ok=True)
    
    if os.path.exists(test_input):
        remove_background(test_input, test_output)
    else:
        print(f"Test image {test_input} not found.")
