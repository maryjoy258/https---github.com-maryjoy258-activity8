import { Component } from '@angular/core';

@Component({
  selector: 'app-music-player',
  templateUrl: './music-player.component.html',
})
export class MusicPlayerComponent {
  audioUrl: string = '';

  playMusic() {
    const audio = new Audio(this.audioUrl);
    audio.play();
  }
}
