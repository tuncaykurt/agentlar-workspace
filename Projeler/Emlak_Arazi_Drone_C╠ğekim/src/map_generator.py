import os
import math
import requests
from src.config import GOOGLE_MAPS_API_KEY, TEMP_DIR, logger

class MapGenerator:
    @staticmethod
    def calculate_bounds(coordinates: list) -> dict:
        lats = [pt[1] for pt in coordinates]
        lons = [pt[0] for pt in coordinates]
        
        north, south = max(lats), min(lats)
        east, west = max(lons), min(lons)
        
        center_lat = (north + south) / 2
        center_lon = (east + west) / 2
        
        width_deg = east - west
        height_deg = north - south
        
        return {
            "north": north, "south": south,
            "east": east, "west": west,
            "center_lat": center_lat, "center_lon": center_lon,
            "width_deg": width_deg, "height_deg": height_deg
        }

    @staticmethod
    def _calculate_zoom(bounds: dict, padding_factor: float = 3.0, target_area: float = None) -> int:
        width_meters = bounds["width_deg"] * 85000
        height_meters = bounds["height_deg"] * 111000
        
        # If target_area is provided (override), ensure the view is large enough to contain it
        if target_area and target_area > 0:
            override_width = math.sqrt(target_area)
            # We want the override width to fit within about 60% of the screen width for breathing room
            required_width = override_width * 1.5
        else:
            required_width = width_meters * padding_factor
        
        # Approximate meters per pixel calculation at zoom 15 to 20
        # Given pixel width is 1080 (or 2160 with scale 2)
        zoom_levels = {
            20: 0.15,
            19: 0.30,
            18: 0.60,
            17: 1.19,
            16: 2.39,
            15: 4.77
        }
        
        target_zoom = 15
        for z, mpp in sorted(zoom_levels.items(), reverse=True):
            if mpp * 1080 >= required_width:
                target_zoom = z
                break
                
        # Constrain to reasonable limits
        target_zoom = min(max(target_zoom, 14), 21)
        logger.info(f"Calculated zoom level {target_zoom} for parcel width {width_meters:.2f}m (Target Area: {target_area if target_area else 'N/A'})")
        return target_zoom

    @classmethod
    def generate_satellite_image(cls, job_id: str, geometry: dict, draw_polygon: bool = True, target_area: float = None) -> str:
        logger.info(f"Generating satellite image for job {job_id} (draw_polygon={draw_polygon}, target_area={target_area})")
        
        if not GOOGLE_MAPS_API_KEY:
            raise ValueError("GOOGLE_MAPS_API_KEY is missing!")
            
        # Assuming simple Polygon GeoJSON format
        try:
            coords = geometry["coordinates"][0]
        except (KeyError, IndexError, TypeError):
            logger.error("Invalid geometry format. Provide a standard GeoJSON Polygon geometry.")
            return None
            
        bounds = cls.calculate_bounds(coords)
        zoom = cls._calculate_zoom(bounds, target_area=target_area)
        
        url = "https://maps.googleapis.com/maps/api/staticmap"
        params = {
            "center": f"{bounds['center_lat']},{bounds['center_lon']}",
            "zoom": zoom,
            "size": "1080x1920",
            "scale": 2,
            "maptype": "satellite",
            "format": "png",
            "key": GOOGLE_MAPS_API_KEY
        }
        
        if draw_polygon:
            path_str = "color:0x00FFFFC0|weight:4"
            for pt in coords:
                path_str += f"|{pt[1]},{pt[0]}"
            params["path"] = path_str
            out_path = os.path.join(TEMP_DIR, f"{job_id}_satellite_drawn.png")
        else:
            out_path = os.path.join(TEMP_DIR, f"{job_id}_satellite_clean.png")
        
        res = requests.get(url, params=params, stream=True)
        if res.status_code == 200:
            out_path = os.path.join(TEMP_DIR, f"{job_id}_satellite.png")
            with open(out_path, 'wb') as f:
                f.write(res.content)
            logger.info(f"Satellite image saved to {out_path}")
            return out_path
        else:
            logger.error(f"Google Maps Static API error: {res.status_code} - {res.text}")
            logger.warning("Using MOCK satellite image so the pipeline can continue.")
            
            # Create a mock green "satellite" image with Pillow 
            try:
                from PIL import Image, ImageDraw
                img = Image.new('RGB', (1080, 1920), color=(34, 139, 34)) # Forest green
                draw = ImageDraw.Draw(img)
                # Draw some random patterns to make it look less plain
                for i in range(20):
                    draw.rectangle(
                        [(100 + i*40, 200 + i*50), (300 + i*30, 400 + i*50)], 
                        fill=(107, 142, 35) # Olive drab
                    )
                out_path = os.path.join(TEMP_DIR, f"{job_id}_satellite_mock.png")
                img.save(out_path)
                logger.info(f"Mock satellite image saved to {out_path}")
                return out_path
            except Exception as e:
                logger.error(f"Failed to create mock image: {e}")
                return None
