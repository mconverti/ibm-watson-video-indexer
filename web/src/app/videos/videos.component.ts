import { Router, ActivatedRoute, Params } from '@angular/router';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { VideosService } from '../videos.service';
import { Observable, Subscription } from 'rxjs/Rx';
declare var $: any;

@Component({
  selector: 'app-videos',
  providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
  templateUrl: './videos.component.html',
  styleUrls: ['./videos.component.css'],
})
export class VideosComponent implements OnInit, OnDestroy {
  static AUTO_REFRESH_INTERVAL: number = 5000;
  static DEFAULT_RESULTS_PAGE_SIZE: number = 10;
  static UPLOAD_SUPPORTED_MIME_TYPE: string = 'video/*';
  static UPLOAD_MAX_FILE: number = 256;

  results: any = { total: 0, results: [] };
  size: number = VideosComponent.DEFAULT_RESULTS_PAGE_SIZE;
  from: number = 0;
  search: string = '';
  lastSearch: string = '';
  loading: boolean = true;

  playingVideoTitle: string = '';
  playingVideoStart: number = 0;

  videoDropzone: any = null;
  uploadingVideoTitle: string = '';
  uploadingVideoDescription: string = '';

  isDestroyed: boolean = false;
  timerSubscription: Subscription;

  constructor(private videosService: VideosService, private activatedRoute: ActivatedRoute, private location: Location) { }

  ngOnInit() {
    this.isDestroyed = false;
    this.loading = true;

    this.activatedRoute.queryParams.subscribe((queryParams: Params) => {
      this.search = queryParams['search'] || '';
      this.from = (!!queryParams['from'] && !isNaN(queryParams['from'])) ? +(queryParams['from']) : 0;
      this.size = (!!queryParams['size'] && !isNaN(queryParams['size'])) ? +(queryParams['size']) : VideosComponent.DEFAULT_RESULTS_PAGE_SIZE;

      this.searchVideos({ resetPager: false, updateLocation: false });
    });

    $('#playerModal').on('hidden.bs.modal', () => {
      $('#player').attr('src', '')​;
    });

    $('#player').on('loadedmetadata', () => {
      if (this.playingVideoStart > 0) {
        console.log('Seeking to: ' + this.playingVideoStart);
        $('#player')[0].currentTime = this.playingVideoStart;
      }

      console.log('Starting playback');
      $('#player')[0].play();
    });

    $('#uploadModal').on('hidden.bs.modal', () => {
      this.uploadingVideoTitle = '';
      this.uploadingVideoDescription = '';

      var filesToRemove = this.videoDropzone.getQueuedFiles();
      for (var i = 0; i < filesToRemove.length; i++) {
        this.videoDropzone.removeFile(filesToRemove[i]);
      }
    });

    var that = this;
    $('#uploadVideoZone').dropzone({
      parallelUploads: 1,
      uploadMultiple: false,
      acceptedFiles: VideosComponent.UPLOAD_SUPPORTED_MIME_TYPE,
      maxFilesize: VideosComponent.UPLOAD_MAX_FILE,
      autoProcessQueue: false,
      addRemoveLinks: false,
      dictDefaultMessage: 'Drop file here to upload a new video',
      init: function () {
        that.videoDropzone = this;

        that.videoDropzone.on('complete', (file) => {
          setTimeout(() => { that.refreshVideos(); }, 500);
          setTimeout(() => { that.videoDropzone.removeFile(file); }, 2000);
        });

        that.videoDropzone.on('addedfile', (file) => {
          if (!file.type.match(VideosComponent.UPLOAD_SUPPORTED_MIME_TYPE)) {
            return;
          }

          if (file.size > (VideosComponent.UPLOAD_MAX_FILE * 1024 * 1024)) {
            return;
          }

          if ($('#uploadModal').is(':visible') || !!that.uploadingVideoTitle) {
            // Remove the file if the upload modal is already visible
            that.videoDropzone.removeFile(file);
          } else {
            that.uploadingVideoTitle = file.name;
            $('#uploadModal').modal();
          }
        });

        that.videoDropzone.on('error', (file) => {
          if (!file.accepted) {
            $(file.previewElement).find('.dz-error-message').css({ 'opacity': 1 });
            setTimeout(() => { that.videoDropzone.removeFile(file); }, 2000);
          }
        });

        that.videoDropzone.on('sending', (file, xhr, formData) => {
          formData.append('title', that.uploadingVideoTitle);
          formData.append('description', that.uploadingVideoDescription);
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    if (!!this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }
  }

  public startUploading(): void {
    this.videoDropzone.processQueue();

    $('#uploadModal').modal('hide')
  }

  public searchVideos(options?: any): void {
    options = options || { resetPager: false, updateLocation: true };
    this.loading = true;
    this.lastSearch = this.search;

    if (!!options.resetPager) {
      this.from = 0;
    }

    if (!!options.updateLocation) {
      var queryParams = [];
      if (!!this.lastSearch) {
        queryParams.push(`search=${encodeURIComponent(this.lastSearch)}`);
      }

      if (!!this.from) {
        queryParams.push(`from=${this.from}`);
      }

      if (this.size !== VideosComponent.DEFAULT_RESULTS_PAGE_SIZE) {
        queryParams.push(`size=${this.size}`);
      }

      if (queryParams.length > 0) {
        this.location.go('/videos', `?${queryParams.join('&')}`);
      } else {
        this.location.go('/videos');
      }
    }

    this.refreshVideos().subscribe(() => {
      this.loading = false;
    });
  }

  public next(event: any): void {
    if (this.hasNext()) {
      this.from += this.size;
      this.searchVideos();
    }

    event.preventDefault();
  }

  public previous(event: any): void {
    if (this.hasPrevious()) {
      this.from -= this.size;
      this.searchVideos();
    }

    event.preventDefault();
  }

  public hasPrevious(): boolean {
    return this.from > 0;
  }

  public hasNext(): boolean {
    return (this.from + this.size) < this.results.total;
  }

  public play(event: any, videoUrl: string, videoTitle: string, videoStart: number): void {
    this.playingVideoTitle = videoTitle;
    this.playingVideoStart = +videoStart || 0;

    $('#playerModal').modal();

    console.log('Loading video');
    $('#player')[0].src = videoUrl​​​​;
    $('#player')[0].load();

    event.preventDefault();
  }

  private refreshVideos() {
    if (!!this.timerSubscription) {
      this.timerSubscription.unsubscribe();
    }

    var searchObservable = this.videosService.getVideos(this.lastSearch, this.size, this.from);

    searchObservable.subscribe(results => {
      this.results = results;
      this.loading = false;
      this.subscribeToData();
    });

    return searchObservable;
  }

  private subscribeToData(): void {
    if (!this.isDestroyed) {
      this.timerSubscription = Observable.timer(VideosComponent.AUTO_REFRESH_INTERVAL).first().subscribe(() => this.refreshVideos());
    }
  }
}
