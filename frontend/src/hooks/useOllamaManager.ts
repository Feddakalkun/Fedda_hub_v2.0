import { useState, useEffect } from 'react';
import { useToast } from '../components/ui/Toast';
import { ollamaService } from '../services/ollamaService';
import type { OllamaModel, OllamaProgress } from '../services/ollamaService';
import { TEXT_MODELS, VISION_MODELS } from '../config/ollamaModels';

export const useOllamaManager = () => {
    const { toast } = useToast();
    const [installedModels, setInstalledModels] = useState<OllamaModel[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);

    // Download UI State
    const [modelCategory, setModelCategory] = useState<'text' | 'vision'>('text');
    const activeList = modelCategory === 'text' ? TEXT_MODELS : VISION_MODELS;

    const [selectedModel, setSelectedModel] = useState(activeList[0].id);
    const [customModel, setCustomModel] = useState('');
    const [isPulling, setIsPulling] = useState(false);
    const [pullProgress, setPullProgress] = useState<OllamaProgress | null>(null);
    const [pullError, setPullError] = useState('');

    useEffect(() => {
        refreshModels();
    }, []);

    // Update selected model when category changes
    useEffect(() => {
        setSelectedModel(activeList[0].id);
    }, [modelCategory, activeList]);

    const refreshModels = async () => {
        setIsLoadingModels(true);
        try {
            const models = await ollamaService.getModels();
            // Sort by recent
            models.sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());
            setInstalledModels(models);
        } catch (error) {
            console.error('Failed to load models', error);
        } finally {
            setIsLoadingModels(false);
        }
    };

    const handlePull = async () => {
        const modelToPull = customModel.trim() || selectedModel;
        if (!modelToPull) return;

        setIsPulling(true);
        setPullProgress({ status: 'Initiating download...', completed: 0, total: 0 });
        setPullError('');

        try {
            await ollamaService.pullModel(modelToPull, (progress) => {
                setPullProgress(progress);
                if (progress.status === 'success') {
                    // Slight delay to show success before refresh
                    setTimeout(refreshModels, 1000);
                }
            });
            setCustomModel('');
        } catch (error) {
            setPullError('Failed to download model. Ensure Ollama is running.');
        } finally {
            setIsPulling(false);
        }
    };

    const handleDelete = async (name: string) => {
        if (!confirm(`Are you sure you want to delete ${name}?`)) return;
        try {
            await ollamaService.deleteModel(name);
            refreshModels();
            toast(`Deleted ${name}`, 'success');
        } catch (error) {
            toast('Failed to delete model', 'error');
        }
    };

    return {
        installedModels,
        isLoadingModels,
        modelCategory,
        setModelCategory,
        activeList,
        selectedModel,
        setSelectedModel,
        customModel,
        setCustomModel,
        isPulling,
        pullProgress,
        pullError,
        refreshModels,
        handlePull,
        handleDelete
    };
};
