const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5257';

export interface GenerateImageResponse {
  imageBase64: string;
  mimeType: string;
}

export async function generateImage(prompt: string): Promise<GenerateImageResponse> {
  const response = await fetch(`${API_URL}/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      (errorData as { detail?: string }).detail ?? `Request failed with status ${response.status}`
    );
  }

  return response.json() as Promise<GenerateImageResponse>;
}
