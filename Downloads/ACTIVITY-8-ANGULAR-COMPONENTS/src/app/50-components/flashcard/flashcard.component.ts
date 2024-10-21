import { Component } from '@angular/core';

@Component({
  selector: 'app-flashcard',
  templateUrl: './flashcard.component.html',
})
export class FlashcardComponent {
  question: string = '';
  answer: string = '';
  showAnswer: boolean = false;

  toggleAnswer() {
    this.showAnswer = !this.showAnswer;
  }
}
