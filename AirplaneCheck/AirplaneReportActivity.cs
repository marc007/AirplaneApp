using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Android.App;
using Android.Content;
using Android.OS;
using Android.Runtime;
using Android.Views;
using Android.Widget;

using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

using Parse;

namespace AirplaneCheck
{
	[Activity (Label = "Airplane Info")]			
	public class AirplaneInfoActivity : ListActivity
	{
		async protected override void OnCreate (Bundle bundle)
		{
			base.OnCreate (bundle);

			//Parse initialization
			ParseClient.Initialize ("VzfpPQ473axJ5uRnQJlLwP35DgsaybTzy9JdSpKs", "eXqhwXdFVwYba7FIEKUs5SIWEHAfvTH7RgmsNNgs");

			var airplanenumber = Intent.GetStringExtra("AirplaneNumber");
			if (!airplanenumber.StartsWith ("N")) airplanenumber = String.Format("N{0}", Intent.GetStringExtra("AirplaneNumber"));

			List<AirplaneInfo> ars = await GetData (airplanenumber);
			ListAdapter = new AirplaneInfoAdapter (this, ars);
        }

		async Task<List<AirplaneInfo>> GetData(string airplanenumber)
		{
			List<AirplaneInfo> airplanenumbers = new List<AirplaneInfo>();
            try
            {
				var query = from faamaster in ParseObject.GetQuery("FAAmaster")
							where faamaster.Get<string>("nnumber").StartsWith(airplanenumber)
							select faamaster;
				Task<IEnumerable<ParseObject>> numbersTask = query.FindAsync ();

				IEnumerable<ParseObject> airplanes = await numbersTask;

				foreach (var airplane in airplanes) {
					airplanenumbers.Add( new AirplaneInfo(airplane));
				}
//				var query = await ParseObject.GetQuery ("FAAmaster").WhereStartsWith("nnumber", airplanenumber);
//				ParseObject faamaster = new ParseObject("FAAmaster");
//				ParseQuery query = new ParseQuery("FAAmaster");
//				IEnumerable<ParseObject> result = await query.WhereStartsWith("nnumber", airplanenumber);

//				string Url = String.Format("http://services.faa.gov/airport/status/{0}?format=json", airplanenumber);
//                HttpClient hc = new HttpClient();
//                Task<string> contentsTask = hc.GetStringAsync(Url); // async method!

                // await! control returns to the caller and the task continues to run on another thread
				//contents = await contentsTask;
				//res = JsonConvert.DeserializeObject<AirplaneReport>(contents);
//                Parallel.ForEach(res.list, currentWeather =>
//                {
//                    var url = String.Format("http://openweathermap.org/img/w/{0}.png", currentWeather.weather[0].icon);
//                    var imageUrl = new Java.Net.URL(url);
//                    Android.Graphics.Bitmap bitmap = Android.Graphics.BitmapFactory.DecodeStream(imageUrl.OpenStream());
//                    currentWeather.weather[0].Image = bitmap;
//                });
            }
            catch (System.Exception sysExc)
            {
                Console.WriteLine(sysExc.Message);
            }
			return airplanenumbers;
        }
	}
}

