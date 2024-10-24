import { Component } from '@angular/core';

@Component({
  selector: 'app-xml-parser',
  templateUrl: './xml-parser.component.html',
})
export class XmlParserComponent {
  xmlInput: string = '';
  parsedResult: any;

  parseXml() {
    const parser = new DOMParser();
    this.parsedResult = parser.parseFromString(this.xmlInput, 'application/xml');
  }
}
