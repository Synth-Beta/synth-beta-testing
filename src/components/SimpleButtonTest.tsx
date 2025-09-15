import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function SimpleButtonTest() {
  const [clickCount, setClickCount] = useState(0);
  const [lastClick, setLastClick] = useState<string>('');

  const handleClick = (buttonName: string) => {
    console.log(`Button clicked: ${buttonName}`);
    setClickCount(prev => prev + 1);
    setLastClick(`${buttonName} at ${new Date().toLocaleTimeString()}`);
    alert(`You clicked ${buttonName}!`);
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Button Click Test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-600">
            Click Count: {clickCount} | Last Click: {lastClick}
          </div>
          
          <div className="space-y-2">
            <Button 
              onClick={() => handleClick('Button 1')}
              className="w-full"
            >
              Test Button 1
            </Button>
            
            <Button 
              onClick={() => handleClick('Button 2')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
            >
              Test Button 2 (Blue)
            </Button>
            
            <Button 
              onClick={() => handleClick('Choose Artist')}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
            >
              Choose Artist
            </Button>
          </div>

          <div className="p-4 bg-gray-100 rounded">
            <h4 className="font-semibold mb-2">Instructions:</h4>
            <ol className="text-sm space-y-1">
              <li>1. Click each button above</li>
              <li>2. Check if you see the alert popup</li>
              <li>3. Check if the click count increases</li>
              <li>4. Check the browser console for logs</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
