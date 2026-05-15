import { Controller, Get, Put, Post, Body } from '@nestjs/common';
import { SettingsService, type LlmSettings } from './settings.service.js';

function maskKey(key: string | undefined): string {
  if (!key) return '';
  if (key.length <= 10) return '••••';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings() {
    const settings = await this.settingsService.getSettings();
    if (!settings) {
      return { configured: false, settings: null };
    }
    return {
      configured: true,
      settings: {
        providerType: settings.providerType,
        baseURL: settings.baseURL ?? '',
        modelName: settings.modelName,
        apiKey: maskKey(settings.apiKey),
      },
    };
  }

  @Put()
  async updateSettings(@Body() body: LlmSettings) {
    await this.settingsService.updateSettings(body);
    return { success: true };
  }

  @Post('check')
  async checkConnection(@Body() body: LlmSettings) {
    return this.settingsService.checkConnection(body);
  }
}
