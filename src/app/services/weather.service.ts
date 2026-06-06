import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, forkJoin, throwError, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface DailyForecast {
  date: string;
  rawDate: string;
  dayName: string;
  tempAvg: number;
  tempMin: number;
  tempMax: number;
  humidityAvg: number;
  windSpeedAvg: number;
  weatherIcon: string;
  weatherDesc: string;
  isExtrapolated: boolean;
}

export interface WeatherData {
  city: string;
  country: string;
  temp: number;
  feelsLike: number;
  tempMin: number;
  tempMax: number;
  humidity: number;
  windSpeed: number;
  pressure: number;
  visibility: number;
  description: string;
  icon: string;
  mainCondition: string;
  sunrise: number;
  sunset: number;
  forecast: DailyForecast[];
  averages: {
    tempAvg: number;
    humidityAvg: number;
    windSpeedAvg: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private defaultApiKey = 'f79c371e35f27bae5b2161df36f7e38c';
  private baseUrl = 'https://api.openweathermap.org/data/2.5';

  constructor(private http: HttpClient) {}

  private getApiKey(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedKey = localStorage.getItem('weather_dashboard_api_key');
      if (storedKey) return storedKey;
    }
    return this.defaultApiKey;
  }

  public setApiKey(key: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (key) {
        localStorage.setItem('weather_dashboard_api_key', key);
      } else {
        localStorage.removeItem('weather_dashboard_api_key');
      }
    }
  }

  public getSavedApiKey(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('weather_dashboard_api_key') || '';
    }
    return '';
  }

  /**
   * Fetches full weather data (current + forecast) by city name
   */
  public getWeather(city: string): Observable<WeatherData> {
    const apiKey = this.getApiKey();
    const currentUrl = `${this.baseUrl}/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
    const forecastUrl = `${this.baseUrl}/forecast?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;

    return forkJoin({
      current: this.http.get<any>(currentUrl),
      forecast: this.http.get<any>(forecastUrl)
    }).pipe(
      map(({ current, forecast }) => this.transformWeatherData(current, forecast)),
      catchError(err => this.handleError(err, city))
    );
  }

  /**
   * Fetches full weather data by coordinates
   */
  public getWeatherByCoords(lat: number, lon: number): Observable<WeatherData> {
    const apiKey = this.getApiKey();
    const currentUrl = `${this.baseUrl}/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
    const forecastUrl = `${this.baseUrl}/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

    return forkJoin({
      current: this.http.get<any>(currentUrl),
      forecast: this.http.get<any>(forecastUrl)
    }).pipe(
      map(({ current, forecast }) => this.transformWeatherData(current, forecast)),
      catchError(err => this.handleError(err, `Coords: ${lat}, ${lon}`))
    );
  }

  /**
   * Transforms raw API response to processed WeatherData structure
   */
  private transformWeatherData(currentRaw: any, forecastRaw: any): WeatherData {
    const forecastList = this.processForecastList(forecastRaw.list || []);
    
    // Calculate Averages for the upcoming 4 days (Index 1 to 4 in the daily forecast)
    const upcomingDays = forecastList.slice(1, 5);
    let tempSum = 0;
    let humiditySum = 0;
    let windSum = 0;
    upcomingDays.forEach(day => {
      tempSum += day.tempAvg;
      humiditySum += day.humidityAvg;
      windSum += day.windSpeedAvg;
    });

    const numDays = upcomingDays.length || 1;
    const averages = {
      tempAvg: Math.round(tempSum / numDays),
      humidityAvg: Math.round(humiditySum / numDays),
      windSpeedAvg: parseFloat((windSum / numDays).toFixed(1))
    };

    return {
      city: currentRaw.name,
      country: currentRaw.sys.country,
      temp: Math.round(currentRaw.main.temp),
      feelsLike: Math.round(currentRaw.main.feels_like),
      tempMin: Math.round(currentRaw.main.temp_min),
      tempMax: Math.round(currentRaw.main.temp_max),
      humidity: currentRaw.main.humidity,
      windSpeed: currentRaw.wind.speed,
      pressure: currentRaw.main.pressure,
      visibility: currentRaw.visibility,
      description: currentRaw.weather[0].description,
      icon: currentRaw.weather[0].icon,
      mainCondition: currentRaw.weather[0].main,
      sunrise: currentRaw.sys.sunrise,
      sunset: currentRaw.sys.sunset,
      forecast: forecastList,
      averages
    };
  }

  /**
   * Processes the 3-hour list from OpenWeatherMap forecast5 API:
   * Groups by day, calculates averages, and extrapolates up to 7 days
   */
  private processForecastList(list: any[]): DailyForecast[] {
    const groups: { [dateStr: string]: any[] } = {};
    list.forEach(item => {
      const dateStr = item.dt_txt.split(' ')[0]; // YYYY-MM-DD
      if (!groups[dateStr]) {
        groups[dateStr] = [];
      }
      groups[dateStr].push(item);
    });

    const dailyForecasts: DailyForecast[] = [];
    const sortedDates = Object.keys(groups).sort();
    
    sortedDates.forEach((dateStr, idx) => {
      const items = groups[dateStr];
      
      let tempSum = 0;
      let humiditySum = 0;
      let windSum = 0;
      let minTemp = Infinity;
      let maxTemp = -Infinity;
      
      items.forEach(item => {
        tempSum += item.main.temp;
        humiditySum += item.main.humidity;
        windSum += item.wind.speed;
        if (item.main.temp_min < minTemp) minTemp = item.main.temp_min;
        if (item.main.temp_max > maxTemp) maxTemp = item.main.temp_max;
      });
      
      const count = items.length;
      const tempAvg = tempSum / count;
      const humidityAvg = humiditySum / count;
      const windSpeedAvg = windSum / count;
      
      const midIndex = Math.floor(count / 2);
      const midItem = items[midIndex];
      
      const dateObj = new Date(dateStr + 'T00:00:00');
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      dailyForecasts.push({
        date: formattedDate,
        rawDate: dateStr,
        dayName: idx === 0 ? 'Today' : dayName,
        tempAvg: Math.round(tempAvg),
        tempMin: Math.round(minTemp),
        tempMax: Math.round(maxTemp),
        humidityAvg: Math.round(humidityAvg),
        windSpeedAvg: parseFloat(windSpeedAvg.toFixed(1)),
        weatherIcon: midItem.weather[0].icon,
        weatherDesc: midItem.weather[0].description,
        isExtrapolated: false
      });
    });

    // Extrapolate to 7 days
    while (dailyForecasts.length < 7 && dailyForecasts.length > 0) {
      const lastDay = dailyForecasts[dailyForecasts.length - 1];
      const secondLastDay = dailyForecasts.length > 1 ? dailyForecasts[dailyForecasts.length - 2] : lastDay;
      
      const lastDateObj = new Date(lastDay.rawDate + 'T00:00:00');
      lastDateObj.setDate(lastDateObj.getDate() + 1);
      
      const nextDateStr = lastDateObj.toISOString().split('T')[0];
      const nextDayName = lastDateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const nextFormattedDate = lastDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      const tempDiff = lastDay.tempAvg - secondLastDay.tempAvg;
      const trend = Math.max(-2, Math.min(2, tempDiff)); // keep trend gradual
      
      const variation = (Math.random() - 0.5) * 1.5; 
      const newTempAvg = Math.round(lastDay.tempAvg + trend + variation);
      const newTempMin = Math.round(lastDay.tempMin + trend + variation - 1);
      const newTempMax = Math.round(lastDay.tempMax + trend + variation + 1);
      
      const newHumidityAvg = Math.max(10, Math.min(100, Math.round(lastDay.humidityAvg + (Math.random() - 0.5) * 8)));
      const newWindSpeed = Math.max(0, parseFloat((lastDay.windSpeedAvg + (Math.random() - 0.5) * 1.5).toFixed(1)));
      
      // Let's cycle icons/descriptions a bit or copy last day
      dailyForecasts.push({
        date: nextFormattedDate,
        rawDate: nextDateStr,
        dayName: nextDayName,
        tempAvg: newTempAvg,
        tempMin: newTempMin,
        tempMax: newTempMax,
        humidityAvg: newHumidityAvg,
        windSpeedAvg: newWindSpeed,
        weatherIcon: lastDay.weatherIcon,
        weatherDesc: lastDay.weatherDesc,
        isExtrapolated: true
      });
    }

    return dailyForecasts;
  }

  /**
   * Custom error handler that passes along HTTP errors, but could also trigger a clean fallback if needed
   */
  private handleError(error: HttpErrorResponse, query: string): Observable<never> {
    console.error('WeatherService API Error:', error);
    let errorMsg = 'Failed to load weather data.';
    if (error.status === 401) {
      errorMsg = 'Invalid API key. Please check your OpenWeatherMap API key configurations.';
    } else if (error.status === 404) {
      errorMsg = `City "${query}" not found. Please try searching another location.`;
    } else if (error.status === 0) {
      errorMsg = 'Network error. Please check your internet connection.';
    }
    return throwError(() => new Error(errorMsg));
  }

  /**
   * Generates high quality mock data for testing/demo mode
   */
  public getMockWeatherData(city: string): WeatherData {
    const isDay = new Date().getHours() > 6 && new Date().getHours() < 18;
    const today = new Date();
    
    const conditions = ['Clear', 'Clouds', 'Rain', 'Snow', 'Thunderstorm', 'Drizzle'];
    // Deterministic selection based on city name length
    const condIdx = city.length % conditions.length;
    const cond = conditions[condIdx];
    
    let baseTemp = 20; // Default
    if (cond === 'Clear') baseTemp = 28;
    else if (cond === 'Clouds') baseTemp = 22;
    else if (cond === 'Rain') baseTemp = 18;
    else if (cond === 'Snow') baseTemp = -2;
    else if (cond === 'Thunderstorm') baseTemp = 24;

    const forecastList: DailyForecast[] = [];
    for (let i = 0; i < 7; i++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(today.getDate() + i);
      const rawDate = forecastDate.toISOString().split('T')[0];
      const dayName = forecastDate.toLocaleDateString('en-US', { weekday: 'long' });
      const formattedDate = forecastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      const tempVar = Math.sin(i) * 3 + (Math.random() - 0.5) * 2;
      const tempAvg = Math.round(baseTemp + tempVar);
      
      forecastList.push({
        date: formattedDate,
        rawDate,
        dayName: i === 0 ? 'Today' : dayName,
        tempAvg,
        tempMin: tempAvg - 3,
        tempMax: tempAvg + 4,
        humidityAvg: 50 + Math.round(Math.cos(i) * 15),
        windSpeedAvg: parseFloat((4.5 + Math.sin(i) * 2).toFixed(1)),
        weatherIcon: cond === 'Clear' ? (isDay ? '01d' : '01n') : cond === 'Clouds' ? '03d' : cond === 'Rain' ? '10d' : cond === 'Snow' ? '13d' : '11d',
        weatherDesc: cond.toLowerCase() + 'y sky',
        isExtrapolated: i >= 5
      });
    }

    const upcomingDays = forecastList.slice(1, 5);
    let tempSum = 0;
    let humiditySum = 0;
    let windSum = 0;
    upcomingDays.forEach(day => {
      tempSum += day.tempAvg;
      humiditySum += day.humidityAvg;
      windSum += day.windSpeedAvg;
    });

    return {
      city: city.charAt(0).toUpperCase() + city.slice(1),
      country: 'IN',
      temp: baseTemp,
      feelsLike: baseTemp + 1,
      tempMin: baseTemp - 2,
      tempMax: baseTemp + 3,
      humidity: 62,
      windSpeed: 4.8,
      pressure: 1012,
      visibility: 10000,
      description: cond.toLowerCase(),
      icon: cond === 'Clear' ? (isDay ? '01d' : '01n') : cond === 'Clouds' ? '03d' : cond === 'Rain' ? '10d' : cond === 'Snow' ? '13d' : '11d',
      mainCondition: cond,
      sunrise: Math.floor(Date.now() / 1000) - 20000,
      sunset: Math.floor(Date.now() / 1000) + 20000,
      forecast: forecastList,
      averages: {
        tempAvg: Math.round(tempSum / 4),
        humidityAvg: Math.round(humiditySum / 4),
        windSpeedAvg: parseFloat((windSum / 4).toFixed(1))
      }
    };
  }
}

