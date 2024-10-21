import { Component } from '@angular/core';

@Component({
  selector: 'app-quote-vault',
  templateUrl: './quote-vault.component.html',
})
export class QuoteVaultComponent {
  quote: string = '';
  quotes: string[] = [];

  addQuote() {
    if (this.quote) {
      this.quotes.push(this.quote);
      this.quote = '';
    }
  }
}
