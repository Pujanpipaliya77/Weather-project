import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherData } from '../../services/weather.service';

@Component({
  selector: 'app-weather-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './weather-card.component.html',
  styleUrl: './weather-card.component.css'
})
export class WeatherCardComponent {
  @Input() weatherData!: WeatherData;

  getWeatherBackgroundClass(): string {
    if (!this.weatherData) return 'from-sky-400 to-blue-500';
    const condition = this.weatherData.mainCondition.toLowerCase();
    
    switch (condition) {
      case 'clear':
        return 'from-amber-400 via-orange-400 to-sky-500';
      case 'clouds':
        return 'from-slate-400 via-sky-500 to-indigo-600';
      case 'rain':
      case 'drizzle':
        return 'from-slate-600 via-slate-800 to-sky-950';
      case 'thunderstorm':
        return 'from-purple-900 via-slate-950 to-blue-900';
      case 'snow':
        return 'from-sky-300 via-blue-400 to-indigo-500';
      default:
        return 'from-sky-400 to-blue-500';
    }
  }

  getWindDirection(deg: number): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(((deg %= 360) < 0 ? deg + 360 : deg) / 45) % 8;
    return directions[index];
  }

  isDaytime(): boolean {
    if (!this.weatherData) return true;
    return this.weatherData.icon.endsWith('d');
  }

  isClearSky(): boolean {
    if (!this.weatherData) return false;
    return this.weatherData.mainCondition.toLowerCase() === 'clear';
  }
}

