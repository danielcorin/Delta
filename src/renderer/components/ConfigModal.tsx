import React, { useState, useEffect } from 'react'
import { Settings } from '../types/types'
import { X, Eye, CheckCircle2, XCircle } from 'lucide-react'

interface ConfigModalProps {
    settings: Settings
    updateProvider: (name: string, apiKey: string) => void
    saveSettings: (settingsToSave: Settings) => Promise<boolean>
    onClose: () => void
}

export function ConfigModal({ settings, updateProvider, saveSettings, onClose }: ConfigModalProps) {
    const [isSaving, setIsSaving] = useState(false)
    const [localValues, setLocalValues] = useState<Record<string, string>>({})
    const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
    const [ollamaStatus, setOllamaStatus] = useState<boolean>(false)

    useEffect(() => {
        const initialValues = {
            ...settings.providers.reduce((acc, provider) => ({
                ...acc,
                [provider.name]: provider.apiKey
            }), {}),
            ollamaUrl: settings.providers.find(p => p.name === 'ollamaUrl')?.apiKey || 'http://localhost:11434'
        }
        setLocalValues(initialValues)
        checkOllamaStatus(initialValues.ollamaUrl)
    }, [settings])

    const checkOllamaStatus = async (url: string) => {
        const status = await window.api.checkOllamaStatus(url)
        setOllamaStatus(status)
    }

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handleEsc)
        return () => window.removeEventListener('keydown', handleEsc)
    }, [onClose])

    const handleSave = async () => {
        setIsSaving(true)
        try {
            const providersData = Object.entries(localValues).map(([name, apiKey]) => ({
                name,
                apiKey
            }))
            await saveSettings({ providers: providersData })
            onClose()
        } catch (err) {
            console.error('Failed to save settings:', err)
        } finally {
            setIsSaving(false)
        }
    }

    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            await handleSave()
        }
    }

    return (
        <div className="text-gray-900 dark:text-gray-100">
            <h2 className="text-lg font-semibold mb-4">API Settings</h2>

            <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                    Ollama Server URL
                </label>
                <div className="relative">
                    <input
                        type="text"
                        value={localValues.ollamaUrl || ''}
                        onChange={async (e) => {
                            const url = e.target.value
                            setLocalValues(prev => ({
                                ...prev,
                                ollamaUrl: url
                            }))
                            await checkOllamaStatus(url)
                        }}
                        onKeyDown={handleKeyDown}
                        className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 pr-20"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2">
                        {ollamaStatus ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                            <XCircle className="w-5 h-5 text-red-500" />
                        )}
                        <X
                            className="w-5 h-5 cursor-pointer text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            onClick={() => {
                                const defaultUrl = 'http://localhost:11434'
                                setLocalValues(prev => ({
                                    ...prev,
                                    ollamaUrl: defaultUrl
                                }))
                                checkOllamaStatus(defaultUrl)
                            }}
                        />
                    </div>
                </div>
            </div>

            {['openai', 'anthropic', 'google'].map(provider => (
                <div key={provider} className="mb-4">
                    <label className="block text-sm font-medium mb-2">
                        {provider}
                    </label>
                    <div className="relative">
                        <input
                            type={showPasswords[provider] ? 'text' : 'password'}
                            value={localValues[provider] || ''}
                            onChange={e => {
                                setLocalValues(prev => ({
                                    ...prev,
                                    [provider]: e.target.value
                                }))
                            }}
                            onKeyDown={handleKeyDown}
                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 pr-20"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-2 select-none">
                            <Eye
                                className="w-5 h-5 cursor-pointer text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                onClick={() => setShowPasswords(prev => ({
                                    ...prev,
                                    [provider]: !prev[provider]
                                }))}
                            />
                            <X
                                className="w-5 h-5 cursor-pointer text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                onClick={() => {
                                    setLocalValues(prev => ({
                                        ...prev,
                                        [provider]: ''
                                    }))
                                    updateProvider(provider, '')
                                }}
                            />
                        </div>
                    </div>
                </div>
            ))}

            <div className="mt-6 flex justify-end gap-4">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    )
}
