import { Component } from '@angular/core';

@Component({
  selector: 'app-name-analyzer',
  templateUrl: './name-analyzer.component.html',
})
export class NameAnalyzerComponent {
  name: string = '';
  analysis: string = '';

  analyzeName() {
    const length = this.name.length;
    const vowels = this.name.match(/[aeiou]/gi)?.length || 0;
    const consonants = length - vowels;
    this.analysis = `Length: ${length}, Vowels: ${vowels}, Consonants: ${consonants}`;
  }
}
