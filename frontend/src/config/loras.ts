// Free LoRA Pack Configuration
export interface LoRAInfo {
    id: string;
    name: string;
    filename: string;
    emoji: string;
    trigger: string;
    description: string;
    /** Appearance anchor — prepend to prompts so the character stays consistent. */
    appearance: string;
    size_mb: number;
    preview: string;       // card image (public path)
    download_url: string;  // direct download link
}

export const FREE_LORAS: LoRAInfo[] = [
    {
        id: 'emmy',
        name: 'Emmy',
        filename: 'emmie_zimage.safetensors',
        emoji: '👱‍♀️',
        trigger: 'emmy',
        description: 'Scandinavian blonde — pale freckled skin, ash-blonde hair, blue-grey eyes.',
        appearance: 'emmy, a Scandinavian woman in her mid-twenties, ash-blonde hair, pale fair skin with light freckles across the nose and cheeks, thick dark eyebrows, pale blue-grey eyes, natural full lips, slim oval face',
        size_mb: 325,
        preview: '/loras/emmy.jpg',
        download_url: 'https://drive.google.com/file/d/1FKAtC5gE_Ng4Tw8pvbiCU_iiZq73MqFG/view?usp=sharing',
    },
    {
        id: 'zana',
        name: 'Zana',
        filename: 'sana_zimage.safetensors',
        emoji: '👩🏽',
        trigger: 'sana',
        description: 'Warm tan skin, long wavy chestnut hair, hazel eyes.',
        appearance: 'sana, a woman in her early twenties, warm tan light-brown skin, long wavy chestnut-brown hair, hazel almond eyes, full lips, subtle freckles, soft oval face',
        size_mb: 162,
        preview: '/loras/zana.jpg',
        download_url: 'https://drive.google.com/file/d/1p_xgPyBFpIleISs-Nwy5rqemoBVCOQPF/view?usp=sharing',
    },
];

export const TOTAL_LORA_SIZE_MB = FREE_LORAS.reduce((sum, lora) => sum + lora.size_mb, 0);
