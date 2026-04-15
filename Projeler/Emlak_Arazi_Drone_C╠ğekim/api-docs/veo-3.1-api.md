# Generate Veo 3.1 AI Video (Fast & Quality)

Create a vertical (9:16) video generation task using the Veo 3.1 API.
Supports generating transition videos between two materials (Start & End frames).

## Creation Endpoint

**Request:** `POST https://api.kie.ai/api/v1/veo/generate`
**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer YOUR_API_KEY`

**JSON Payload (2 Images -> Video interpolation):**
```json
{
  "prompt": "Detailed description of the transition or scene.",
  "imageUrls": [
    "http://example.com/start_frame.jpg",
    "http://example.com/end_frame.jpg"
  ],
  "model": "veo3_fast",
  "generationType": "FIRST_AND_LAST_FRAMES_2_VIDEO",
  "aspect_ratio": "9:16"
}
```

*Note: For single image to video, provide 1 image in `imageUrls` and use `generationType: FIRST_AND_LAST_FRAMES_2_VIDEO`.*

**Creation Response:**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "veo_task_abcdef123456"
  }
}
```

## Polling Endpoint (Check Status)

**Request:** `GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId={taskId}`
**Headers:** `Authorization: Bearer YOUR_API_KEY`

**Response Example (When Success):**
```json
{
  "code": 200,
  "msg": "success",
  "data": {
    "taskId": "veo_task_abcdef123456",
    "state": "success",
    "resultJson": {
       "resultUrls": ["https://generated-video-url.mp4"]
    }
  }
}
```
*Note: The `state` field will be "success" when video generation is completed.*