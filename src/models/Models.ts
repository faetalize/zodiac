export enum ChatModel  {
    PRO = "gemini-3-pro-preview",
    FLASH = "gemini-2.5-flash",
    FLASH_LATEST = "gemini-flash-latest",
    FLASH_LITE = "gemini-2.5-flash-lite",
    FLASH_LITE_LATEST = "gemini-flash-lite-latest",
    NANO_BANANA = "gemini-2.5-flash-image-preview"
}

export enum ImageModel {
    ULTRA = "imagen-4.0-ultra-generate-001",
    ILLUSTRIOUS = "illustrious",
    BLXL = "biglust"
}

export enum ImageModelLabel{
    ULTRA = "Imagen 4.0 Ultra",
    ILLUSTRIOUS = "Illustrious (Anime)",
    BLXL = "BLXL (Realism)"
}

export enum ImageEditModel {
    SEEDREAM = "seedream",
    QWEN = "qwen"
}