import { Controller, Get, Put, Post, Body } from '@nestjs/common';
import { SettingsService, type LlmSettings } from './settings.service.js';

@Controller('api/settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getSettings() {
    const settings = await this.settingsService.getSettings();
    if (!settings) {
      return { configured: false, settings: null };
    }
    // Mask API key for security
    return {
      configured: true,
      settings: {
        ...settings,
        apiKey: settings.apiKey
          ? `${settings.apiKey.slice(0, 6)}...${settings.apiKey.slice(-4)}`
          : '',
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
