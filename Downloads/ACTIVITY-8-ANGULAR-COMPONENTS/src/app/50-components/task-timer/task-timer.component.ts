import { Component } from '@angular/core';

@Component({
  selector: 'app-task-timer',
  templateUrl: './task-timer.component.html',
})
export class TaskTimerComponent {
  duration: number | null = null;
  intervalId: any;
  timeRemaining: number | null = null;

  startTimer() {
    this.timeRemaining = this.duration || 0;
    this.intervalId = setInterval(() => {
      if (this.timeRemaining! > 0) {
        this.timeRemaining!--;
      } else {
        clearInterval(this.intervalId);
        alert('Time is up!');
      }
    }, 1000);
  }

  stopTimer() {
    clearInterval(this.intervalId);
  }
}
