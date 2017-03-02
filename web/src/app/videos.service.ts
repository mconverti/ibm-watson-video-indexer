import { Injectable } from '@angular/core';
import { Http } from '@angular/http';
import 'rxjs/add/operator/map';

@Injectable()
export class VideosService {

  constructor(private http: Http) { }

  // Get videos from the API
  getVideo(id) {
    return this.http.get(`/api/videos/${id}?nocache=${Date.now()}`)
      .map(res => res.json());
  }

  // Get videos from the API
  getVideos(search, size, from) {
    return this.http.get(`/api/videos?size=${size}&from=${from}&search=${encodeURIComponent(search)}&nocache=${Date.now()}`)
      .map(res => res.json());
  }

 // Get videos from the API
  getVideoInsights(id, search, size, from)  {
    return this.http.get(`/api/videos/${id}/insights?size=${size}&from=${from}&search=${encodeURIComponent(search)}&nocache=${Date.now()}`)
      .map(res => res.json());
  }

  // Get insights from the API
  getInsights(search, size, from) {
    return this.http.get(`/api/insights?size=${size}&from=${from}&search=${encodeURIComponent(search)}&nocache=${Date.now()}`)
      .map(res => res.json());
  }
}
