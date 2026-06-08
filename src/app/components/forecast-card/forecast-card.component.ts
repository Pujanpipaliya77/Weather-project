import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DailyForecast } from '../../services/weather.service';

@Component({
  selector: 'app-forecast-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './forecast-card.component.html',
  styleUrl: './forecast-card.component.css'
})
export class ForecastCardComponent {
  @Input() forecastList: DailyForecast[] = [];

  isDaytime(icon: string): boolean {
    return icon.endsWith('d');
  }

  isClearSky(icon: string): boolean {
    return icon.startsWith('01');
  }
}

