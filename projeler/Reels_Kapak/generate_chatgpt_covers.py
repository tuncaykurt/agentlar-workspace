import random, os
from autonomous_cover_agent import run_autonomous_generation

cutout_dir = 'assets/cutouts'
cutouts = [f for f in os.listdir(cutout_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]

scenes = [
    "A hacker-style cinematic close-up. The subject is brightly lit by a glowing digital screen displaying code, representing a secret bypass.",
    "A moody environmental portrait with neon reflections. The subject holds a glowing locked vault that is bursting open with bright light.",
    "An empowering dynamic shot. The subject looks mindblown with a giant glowing 'FREE' sign floating dramatically in the background."
]

for v_idx in range(1, 4):
    print(f"Generating variant {v_idx}...")
    cutout = os.path.join(cutout_dir, random.choice(cutouts))
    
    # We pass another cutout as extra reference for face identity
    extra_cutout = os.path.join(cutout_dir, random.choice(cutouts))
    
    run_autonomous_generation(
        local_person_image_path=cutout,
        video_topic='Bedava ChatGPT kullanma hilesi',
        main_text='0 TL CHATGPT',
        output_path=f'outputs/chatgpt_0TL_V{v_idx}.png',
        max_retries=2,
        variant_index=v_idx,
        script_text='',
        scene_description=scenes[v_idx-1],
        extra_cutout_paths=[extra_cutout]
    )
    print(f"Variant {v_idx} complete.")
