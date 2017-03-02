import { Pipe, PipeTransform } from '@angular/core';

@Pipe({name: 'timecode'})
export class TimecodePipe implements PipeTransform {
  transform(timeInSeconds: number): string {
    if ((timeInSeconds === null) || (timeInSeconds === undefined)) {
      return '';
    }

    var hours = Math.trunc(timeInSeconds / 60 / 60),
      minutes = Math.trunc(timeInSeconds / 60) % 60,
      seconds = Math.trunc(timeInSeconds % 60),
      decimals = Math.round((timeInSeconds % 1) * 100);

    var timecode = this.toString(hours, 2) + ':' + this.toString(minutes, 2) + ':' + this.toString(seconds, 2);
    if (decimals > 0) {
      timecode += '.' + this.toString(decimals, 2);
    }

    return timecode;
  }

  private toString(value: number, digits: number): string {
    var str = value.toString();
    if (str.length < digits) {
      str = '0'.repeat(digits - str.length) + str;
    }

    return str;
  }
}