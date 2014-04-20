using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

using Android.App;
using Android.Content;
using Android.OS;
using Android.Runtime;
using Android.Views;
using Android.Widget;

using Parse;
using System.Threading.Tasks;

namespace AirplaneCheck
{
	[Activity (Label = "AirplaneCheck", MainLauncher = true)]			
	public class MainActivity : Activity
	{
		ListView airplanelistview;
		AirplaneInfoAdapter airplaneadapter;

		protected override void OnCreate (Bundle bundle)
		{
			base.OnCreate (bundle);

			// Set our view from the "main" layout resource
			SetContentView (Resource.Layout.AirplaneSearch);

			// Create your application here
			Button searchbutton = FindViewById<Button> (Resource.Id.search);
			EditText airplanetext = FindViewById<EditText>(Resource.Id.airplanenumber);
			airplanelistview = FindViewById<ListView> (Resource.Id.AirplaneListView);

			//Parse initialization
			ParseClient.Initialize ("VzfpPQ473axJ5uRnQJlLwP35DgsaybTzy9JdSpKs", "eXqhwXdFVwYba7FIEKUs5SIWEHAfvTH7RgmsNNgs");

			searchbutton.Click += delegate {
				string airplanenumber = Convert.ToString(airplanetext.Text);
				if (!String.IsNullOrEmpty(airplanenumber)) {
					AirplaneInfoData.Service.ClearCache();

					if (!airplanenumber.StartsWith ("N"))
						airplanenumber = String.Format("N{0}", airplanenumber);

					showAirplaneNumbers(airplanenumber);
				}
			};
		}

		public override bool OnCreateOptionsMenu (IMenu menu)
		{
			MenuInflater.Inflate (Resource.Menu.AirplaneMainMenu, menu);
			return base.OnCreateOptionsMenu (menu);
		}

		public override bool OnOptionsItemSelected (IMenuItem item)
		{
			switch (item.ItemId) {
			case Resource.Id.actionNew:
				break;
			case Resource.Id.actionRefresh:
				AirplaneInfoData.Service.RefreshCache ();
				airplaneadapter.NotifyDataSetChanged ();
				break;
			default:
					break;
			}

			return base.OnOptionsItemSelected (item);
		}

		async protected void showAirplaneNumbers(string airplanenumber)
		{
			bool result = await GetData (airplanenumber);

			if (result) {
				airplaneadapter = new AirplaneInfoAdapter (this);
				airplanelistview.Adapter = airplaneadapter;
			}
		}

		async Task<bool> GetData(string airplanenumber)
		{
			bool _result = false;
			try
			{
				var query = from faamaster in ParseObject.GetQuery("FAAmaster")
						where faamaster.Get<string>("nnumber").StartsWith(airplanenumber)
					select faamaster;
				Task<IEnumerable<ParseObject>> numbersTask = query.FindAsync ();

				IEnumerable<ParseObject> airplanes = await numbersTask;

				foreach (var airplane in airplanes) {
					AirplaneInfoData.Service.SaveAirplaneInfo( new AirplaneInfo(airplane));
				}

				_result = true;
				Console.WriteLine(String.Format("Total Airplanes:{0}",AirplaneInfoData.Service.AirplaneInfos.Count));
			}
			catch (System.Exception sysExc)
			{
				Console.WriteLine(sysExc.Message);
			}
			return _result;
		}

	}
}

