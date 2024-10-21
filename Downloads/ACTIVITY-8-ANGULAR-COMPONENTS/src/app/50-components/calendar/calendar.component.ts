import { Component } from '@angular/core';

@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
})
export class CalendarComponent {
  currentMonth: number = new Date().getMonth();
  currentYear: number = new Date().getFullYear();
  days: number[] = [];

  generateCalendar() {
    this.days = [];
    const date = new Date(this.currentYear, this.currentMonth + 1, 0);
    for (let i = 1; i <= date.getDate(); i++) {
      this.days.push(i);
    }
  }
}
